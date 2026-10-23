// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 浏览器登录（与 Kiro IDE / kiro-cli 相同的门户授权流程）。
//!
//! 流程：
//! 1. 在本机 10 个被 Kiro 授权服务白名单允许的回调端口上启动一次性本地 HTTP 服务；
//! 2. 打开 `https://app.kiro.dev/signin`（Kiro 自己的登录页），由网页让用户选择
//!    Google / GitHub / AWS Builder ID / 组织 SSO 并完成登录；
//! 3. 网页回跳到 `http://localhost:<port>/oauth/callback?login_option=…&state=…`，校验 state
//!    后按登录方式分流：
//!    - Social（Google / GitHub）：回调带 `code`，用 code + PKCE verifier 换 token；
//!    - Builder ID / 组织 SSO：回调只带 `issuer_url`、`idc_region`，门户到此为止，后面还要
//!      自己跑一段 AWS SSO OIDC 授权（registerClient → 浏览器授权 → code 换 token），
//!      与 Kiro IDE 的 IDCAuthProvider 一致，见 [`authorize_idc`]；
//! 4. 以禁用状态创建账号 → 余额验活 → 启用（与 Kiro IDE / KAM 导入一致）。
//!
//! 注意：Kiro 的授权服务只接受预注册的回调地址——`kiro://` 自定义协议或下列固定 loopback
//! 端口，所以门户回调的端口不能随便选；token 交换时 `redirect_uri` 必须与回调路径和
//! `login_option` 完全一致。该接口属于 Kiro 未公开契约，服务端变更或 CloudFront 按 IP
//! 拦截时会在错误信息里说明。AWS SSO OIDC 那一段不受端口白名单限制（Kiro 自己也用随机
//! 端口），所以 IdC 授权用临时端口。

use crate::error::IpcError;
use crate::state::AppState;
use base64::Engine as _;
use kiro_core::admin::types::AddCredentialRequest;
use kiro_core::http_client::{ProxyConfig, build_client};
use kiro_core::kam::refresh_token_hash;
use kiro_core::model::config::Config;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// 登录状态事件：payload 为 [`OauthStatus`]
pub const OAUTH_STATUS_EVENT: &str = "oauth://status";

/// Kiro 自己的登录页（网页里选择 Google / GitHub / Builder ID / 组织 SSO）
const PORTAL_URL: &str = "https://app.kiro.dev/signin";
const TOKEN_PATH: &str = "/oauth/token";
/// Kiro 授权服务只接受这些预注册的 loopback 回调端口
const CALLBACK_PORTS: [u16; 10] = [
    3128, 4649, 6588, 8008, 9091, 49153, 50153, 51153, 52153, 53153,
];
const CALLBACK_PATHS: [&str; 2] = ["/oauth/callback", "/signin/callback"];
/// 用户在浏览器里完成登录的最长等待时间
const LOGIN_TIMEOUT: Duration = Duration::from_secs(10 * 60);
const HTTP_TIMEOUT_SECS: u64 = 20;
/// AWS Builder ID 的 SSO start URL（Kiro IDE 的 BUILDER_ID_START_URL）
const BUILDER_ID_START_URL: &str = "https://view.awsapps.com/start";
/// IdC 授权申请的 scope（与 Kiro IDE 的 GRANT_SCOPES 一致）
const IDC_SCOPES: [&str; 5] = [
    "codewhisperer:completions",
    "codewhisperer:analysis",
    "codewhisperer:conversations",
    "codewhisperer:transformations",
    "codewhisperer:taskassist",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OauthPhase {
    Idle,
    /// 已打开浏览器登录页，等待网页回调
    Waiting,
    /// 已收到回调，正在换取 token 并验证账号
    Verifying,
    Success,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthStatus {
    pub phase: OauthPhase,
    /// "Google" / "Github"，回调后才能确定
    pub provider: Option<String>,
    /// 打开的 Kiro 登录页地址
    pub verification_url: Option<String>,
    pub message: Option<String>,
    pub credential_id: Option<u64>,
}

impl OauthStatus {
    fn idle() -> Self {
        Self {
            phase: OauthPhase::Idle,
            provider: None,
            verification_url: None,
            message: None,
            credential_id: None,
        }
    }
}

pub struct OauthState {
    status: Mutex<OauthStatus>,
    /// 当前登录会话的取消开关；Some 表示有登录正在进行
    session: Mutex<Option<Arc<AtomicBool>>>,
}

impl Default for OauthState {
    fn default() -> Self {
        Self {
            status: Mutex::new(OauthStatus::idle()),
            session: Mutex::new(None),
        }
    }
}

fn publish(app: &AppHandle, status: OauthStatus) {
    *app.state::<OauthState>().status.lock() = status.clone();
    let _ = app.emit(OAUTH_STATUS_EVENT, &status);
}

pub fn status(app: &AppHandle) -> OauthStatus {
    app.state::<OauthState>().status.lock().clone()
}

/// 结束会话（只在仍是同一个会话时清空，避免旧任务误清新会话）
fn end_session(state: &OauthState, cancel: &Arc<AtomicBool>) {
    let mut session = state.session.lock();
    if session
        .as_ref()
        .is_some_and(|current| Arc::ptr_eq(current, cancel))
    {
        *session = None;
    }
}

/// 打开 Kiro 登录页并等待网页回调。
///
/// 返回「等待授权」状态；后续进展通过 `oauth://status` 事件推送。
pub async fn start(app: AppHandle) -> Result<OauthStatus, IpcError> {
    let config = {
        let state = app.state::<AppState>();
        state.core()?.config.read().clone()
    };
    {
        let state = app.state::<OauthState>();
        if state.session.lock().is_some() {
            return Err(IpcError::new(
                "login_in_progress",
                "已有登录正在等待浏览器授权，请先在页面上取消",
            ));
        }
    }

    let (listener, port) = bind_callback_listener()?;
    let state_token = random_token(24)?;
    let verifier = random_token(32)?;
    let challenge = code_challenge(&verifier);
    let portal = portal_url(&state_token, &challenge, port)?;

    let cancel = Arc::new(AtomicBool::new(false));
    app.state::<OauthState>()
        .session
        .lock()
        .replace(cancel.clone());

    let client = build_client(
        proxy_of(&config).as_ref(),
        HTTP_TIMEOUT_SECS,
        config.tls_backend,
    )
    .map_err(|e| IpcError::new("invalid_proxy", format!("代理地址无效：{e}")))?;

    if let Err(e) = app.opener().open_url(portal.clone(), None::<&str>) {
        end_session(&app.state::<OauthState>(), &cancel);
        let error = IpcError::new("login_failed", format!("无法打开浏览器：{e}"));
        publish(&app, failed_status(None, &error));
        return Err(error);
    }

    let waiting = OauthStatus {
        phase: OauthPhase::Waiting,
        provider: None,
        verification_url: Some(portal.to_string()),
        message: Some("请在浏览器中选择登录方式并完成登录".to_string()),
        credential_id: None,
    };
    publish(&app, waiting.clone());

    let base = format!(
        "https://prod.{}.auth.desktop.kiro.dev",
        config.effective_auth_region()
    );
    let task_app = app.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = wait_for_callback(listener, &state_token, &cancel).await;
        let status = match outcome {
            Ok(callback) => {
                complete_login(
                    task_app.clone(),
                    &client,
                    &base,
                    &callback,
                    &verifier,
                    port,
                    &cancel,
                )
                .await
            }
            Err(WaitError::Cancelled) => cancelled_status(None),
            Err(WaitError::Failed(error)) => failed_status(None, &error),
        };
        end_session(&task_app.state::<OauthState>(), &cancel);
        publish(&task_app, status);
    });

    Ok(waiting)
}

/// 取消当前的浏览器登录
pub fn cancel(app: &AppHandle) -> OauthStatus {
    let state = app.state::<OauthState>();
    let pending = state.session.lock().take();
    if let Some(cancel) = pending {
        cancel.store(true, Ordering::SeqCst);
    }
    let status = cancelled_status(state.status.lock().provider.clone());
    publish(app, status.clone());
    status
}

/// 重新打开当前登录的 Kiro 登录页（用户误关浏览器时用）；只打开自己生成的链接
pub fn reopen(app: &AppHandle) -> Result<(), IpcError> {
    let url = app
        .state::<OauthState>()
        .status
        .lock()
        .verification_url
        .clone()
        .ok_or_else(|| IpcError::new("not_found", "没有正在进行的登录"))?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(IpcError::internal)
}

#[derive(Debug)]
enum WaitError {
    Cancelled,
    Failed(IpcError),
}

#[derive(Debug)]
struct Callback {
    /// Google / GitHub 回调携带的授权码；Builder ID / 组织 SSO 的回调没有
    code: Option<String>,
    login_option: String,
    path: String,
    /// 门户给出的 IdC issuer（Builder ID 是固定 start URL，组织 SSO 是租户 start URL）
    issuer_url: Option<String>,
    /// IdC 所在 AWS Region
    idc_region: Option<String>,
}

async fn wait_for_callback(
    listener: TcpListener,
    expected_state: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<Callback, WaitError> {
    let deadline = Instant::now() + LOGIN_TIMEOUT;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(WaitError::Cancelled);
        }
        if Instant::now() >= deadline {
            return Err(WaitError::Failed(IpcError::new(
                "login_expired",
                "等待浏览器登录超时，请重新发起登录",
            )));
        }
        let accepted = tokio::time::timeout(Duration::from_millis(300), listener.accept()).await;
        let (mut socket, _) = match accepted {
            Err(_) => continue,
            Ok(Err(error)) => {
                return Err(WaitError::Failed(IpcError::new(
                    "login_failed",
                    format!("本地回调服务异常：{error}"),
                )));
            }
            Ok(Ok(value)) => value,
        };

        let mut buffer = vec![0u8; 8192];
        let read = tokio::time::timeout(Duration::from_secs(3), socket.read(&mut buffer)).await;
        let Ok(Ok(n)) = read else {
            let _ = respond(&mut socket, 400, "请求读取失败").await;
            continue;
        };
        let request = String::from_utf8_lossy(&buffer[..n]);
        let target = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");

        match parse_callback(target, expected_state) {
            Ok(Some(callback)) => {
                tracing::info!(
                    "浏览器登录回调：path={} login_option={}",
                    callback.path,
                    callback.login_option
                );
                let _ = respond(&mut socket, 200, SUCCESS_PAGE).await;
                return Ok(callback);
            }
            Ok(None) => {
                // 非回调路径（favicon 等）：回 404 继续等待
                let _ = respond(&mut socket, 404, "not found").await;
            }
            Err(error) => {
                // 回调参数是排查这类问题的唯一线索（例如登录方式不支持时缺 code）
                tracing::warn!(
                    "浏览器登录回调失败：target={} error={}",
                    truncate(target, 200),
                    error.message
                );
                let _ = respond(&mut socket, 400, &error.message).await;
                return Err(WaitError::Failed(error));
            }
        }
    }
}

/// 解析回调请求行里的路径与查询参数；`Ok(None)` 表示不是回调路径。
fn parse_callback(target: &str, expected_state: &str) -> Result<Option<Callback>, IpcError> {
    let url = tauri::Url::parse(&format!("http://localhost{target}"))
        .map_err(|e| IpcError::new("login_failed", format!("回调地址无法解析：{e}")))?;
    let path = url.path().to_string();
    if !CALLBACK_PATHS.contains(&path.as_str()) {
        return Ok(None);
    }
    let params: Vec<(String, String)> = url.query_pairs().into_owned().collect();
    let get = |name: &str| {
        params
            .iter()
            .find(|(key, _)| key == name)
            .map(|(_, value)| value.clone())
    };
    if get("state").as_deref() != Some(expected_state) {
        return Err(IpcError::new(
            "login_failed",
            "登录回调校验失败（state 不匹配），请重试",
        ));
    }
    if let Some(error) = get("error").or_else(|| get("error_description")) {
        return Err(IpcError::new(
            "login_failed",
            format!("Kiro 登录失败：{error}"),
        ));
    }
    // Builder ID / 组织 SSO 的回调只带 issuer_url、idc_region，没有 code：
    // 这两种方式在门户之后还要再跑一段 AWS SSO OIDC 授权，由 complete_login 接续。
    let login_option = get("login_option").unwrap_or_default();
    let code = get("code").filter(|value| !value.is_empty());
    let kind = login_kind(&login_option).ok_or_else(|| {
        let shown = if login_option.trim().is_empty() {
            "所选方式".to_string()
        } else {
            login_option.clone()
        };
        IpcError::new(
            "login_unsupported",
            format!("暂不支持 {shown} 登录，请重试并在网页中选择支持的登录方式"),
        )
    })?;
    if kind == LoginKind::Social && code.is_none() {
        return Err(IpcError::new(
            "login_failed",
            "登录回调缺少授权码，请重新发起登录",
        ));
    }
    Ok(Some(Callback {
        code,
        login_option,
        path,
        issuer_url: get("issuer_url").filter(|value| !value.is_empty()),
        idc_region: get("idc_region").filter(|value| !value.is_empty()),
    }))
}

async fn complete_login(
    app: AppHandle,
    client: &reqwest::Client,
    base: &str,
    callback: &Callback,
    verifier: &str,
    port: u16,
    cancel: &Arc<AtomicBool>,
) -> OauthStatus {
    let Some(kind) = login_kind(&callback.login_option) else {
        return failed_status(None, &unsupported_login(&callback.login_option));
    };
    let Some(provider) = provider_from_login_option(&callback.login_option) else {
        return failed_status(None, &unsupported_login(&callback.login_option));
    };

    publish(
        &app,
        OauthStatus {
            phase: OauthPhase::Verifying,
            provider: Some(provider.clone()),
            verification_url: None,
            message: Some(match kind {
                LoginKind::Social => "登录成功，正在验证账号…".to_string(),
                LoginKind::Idc => "已通过门户验证，正在完成 AWS SSO 授权…".to_string(),
            }),
            credential_id: None,
        },
    );

    let tokens = match kind {
        LoginKind::Social => {
            let Some(code) = callback.code.as_deref() else {
                return failed_status(
                    Some(provider),
                    &IpcError::new("login_failed", "登录回调缺少授权码，请重新发起登录"),
                );
            };
            // token 交换的 redirect_uri 必须与回调路径和 login_option 完全一致
            let redirect_uri = callback_redirect_uri(port, &callback.path, &callback.login_option);
            match exchange_code(client, base, code, verifier, &redirect_uri).await {
                Ok(tokens) => AuthTokens {
                    auth_method: "social",
                    provider: provider.clone(),
                    ..tokens
                },
                Err(error) => return failed_status(Some(provider), &error),
            }
        }
        LoginKind::Idc => match authorize_idc(&app, client, callback, cancel).await {
            Ok(tokens) => tokens,
            Err(error) => return failed_status(Some(provider), &error),
        },
    };

    let core = match app.state::<AppState>().core() {
        Ok(core) => core,
        Err(error) => return failed_status(Some(provider), &error),
    };
    match create_account(&core, tokens).await {
        Ok((credential_id, verified)) => OauthStatus {
            phase: OauthPhase::Success,
            provider: Some(provider),
            verification_url: None,
            message: Some(if verified {
                "账号已添加并启用".to_string()
            } else {
                "账号已添加，但验活失败，暂时保持禁用".to_string()
            }),
            credential_id: Some(credential_id),
        },
        Err(error) => failed_status(Some(provider), &error),
    }
}

fn unsupported_login(login_option: &str) -> IpcError {
    let shown = if login_option.trim().is_empty() {
        "所选方式".to_string()
    } else {
        login_option.to_string()
    };
    IpcError::new("login_unsupported", format!("暂不支持 {shown} 登录"))
}

/// 门户之后的第二段授权：AWS SSO OIDC（Builder ID 与组织 SSO 共用）。
///
/// 与 Kiro IDE 的 IDCAuthProvider 一致：注册一个公共 client → 打开 AWS 授权页 →
/// 收 loopback 回调里的 code → 换 token。拿到的是 IdC 的 refreshToken + clientId/Secret，
/// 后续刷新走现有的 `refresh_idc_token`。
async fn authorize_idc(
    app: &AppHandle,
    client: &reqwest::Client,
    callback: &Callback,
    cancel: &Arc<AtomicBool>,
) -> Result<AuthTokens, IpcError> {
    let provider = provider_from_login_option(&callback.login_option)
        .unwrap_or_else(|| "BuilderId".to_string());
    let issuer_url = callback
        .issuer_url
        .clone()
        .or_else(|| {
            // Builder ID 的 issuer 是固定的；门户没给时按 Kiro IDE 的常量兜底
            (provider == "BuilderId").then(|| BUILDER_ID_START_URL.to_string())
        })
        .ok_or_else(|| {
            IpcError::new(
                "login_failed",
                "登录回调缺少 issuer_url，无法完成组织 SSO 授权，请重新发起登录",
            )
        })?;
    let region = callback
        .idc_region
        .clone()
        .unwrap_or_else(|| "us-east-1".to_string())
        .trim()
        .to_ascii_lowercase();
    let oidc_base = format!("https://oidc.{region}.amazonaws.com");

    // 1. 注册公共 client（Kiro IDE 每次登录都重新注册，有效期很短）
    let registration = register_idc_client(client, &oidc_base, &issuer_url).await?;

    // 2. 起本地回调服务并打开 AWS 授权页
    let (listener, port) = bind_ephemeral_listener()?;
    let redirect_uri = format!("http://127.0.0.1:{port}/oauth/callback");
    let state = random_token(24)?;
    let verifier = random_token(32)?;
    let challenge = code_challenge(&verifier);
    let authorize_url = idc_authorize_url(
        &oidc_base,
        &registration.client_id,
        &redirect_uri,
        &state,
        &challenge,
    )?;

    tracing::info!(
        "IdC 授权：provider={} region={} redirect_uri={}",
        provider,
        region,
        redirect_uri
    );
    app.opener()
        .open_url(authorize_url.clone(), None::<&str>)
        .map_err(|e| IpcError::new("login_failed", format!("无法打开 AWS 授权页：{e}")))?;

    // 这一步仍在等用户在 AWS 页面登录，不是「正在验证账号」：把真实链接交给界面，
    // 用户关掉标签页时可从这里重新打开。
    //
    // 授权页会用浏览器里「已登录的 AWS 账号」静默通过；用户常有多 个 Builder ID，
    // 授权到错误的免费账号时上游不会报错、只会在建号后显示 KIRO FREE，
    // 所以必须在此提醒确认身份。
    publish(
        app,
        OauthStatus {
            phase: OauthPhase::Waiting,
            provider: Some(provider.clone()),
            verification_url: Some(authorize_url.to_string()),
            message: Some(format!(
                "门户验证通过，请在浏览器中完成 {provider} 的 AWS 登录授权；\
                 若浏览器已登录其他 AWS 账号，请先在页面右上角退出，再用目标账号登录"
            )),
            credential_id: None,
        },
    );

    // 3. 等浏览器回跳拿到 code
    let code = match wait_for_idc_callback(listener, &state, cancel).await {
        Ok(code) => code,
        Err(WaitError::Cancelled) => {
            return Err(IpcError::new("login_cancelled", "已取消登录"));
        }
        Err(WaitError::Failed(error)) => return Err(error),
    };

    // 4. code 换 token
    let tokens = exchange_idc_code(
        client,
        &oidc_base,
        &registration,
        &code,
        &verifier,
        &redirect_uri,
    )
    .await?;

    Ok(AuthTokens {
        auth_method: "idc",
        refresh_token: tokens.refresh_token,
        profile_arn: None,
        client_id: Some(registration.client_id),
        client_secret: Some(registration.client_secret),
        region: Some(region),
        provider,
    })
}

struct IdcClientRegistration {
    client_id: String,
    client_secret: String,
}

async fn register_idc_client(
    client: &reqwest::Client,
    oidc_base: &str,
    issuer_url: &str,
) -> Result<IdcClientRegistration, IpcError> {
    let scopes: Vec<&str> = IDC_SCOPES.to_vec();
    let response = client
        .post(format!("{oidc_base}/client/register"))
        .header("Content-Type", "application/json")
        .header("Connection", "close")
        .json(&serde_json::json!({
            "clientName": "Kiro IDE",
            "clientType": "public",
            "scopes": scopes,
            "grantTypes": ["authorization_code", "refresh_token"],
            "redirectUris": ["http://127.0.0.1/oauth/callback"],
            "issuerUrl": issuer_url,
        }))
        .send()
        .await
        .map_err(|e| describe_request_error(&e))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(describe_http_error(status.as_u16(), &body));
    }
    let parsed: IdcRegisterResponse = serde_json::from_str(&body)
        .map_err(|e| IpcError::new("login_failed", format!("AWS 客户端注册响应无法解析：{e}")))?;
    Ok(IdcClientRegistration {
        client_id: parsed.client_id,
        client_secret: parsed.client_secret,
    })
}

fn idc_authorize_url(
    oidc_base: &str,
    client_id: &str,
    redirect_uri: &str,
    state: &str,
    challenge: &str,
) -> Result<tauri::Url, IpcError> {
    let mut url = tauri::Url::parse(&format!("{oidc_base}/authorize"))
        .map_err(|e| IpcError::new("login_failed", format!("AWS 授权地址无效：{e}")))?;
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("client_id", client_id)
        .append_pair("redirect_uri", redirect_uri)
        .append_pair("scopes", &IDC_SCOPES.join(","))
        .append_pair("state", state)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256");
    Ok(url)
}

/// 等 AWS SSO OIDC 的 loopback 回调，返回授权码
async fn wait_for_idc_callback(
    listener: TcpListener,
    expected_state: &str,
    cancel: &Arc<AtomicBool>,
) -> Result<String, WaitError> {
    let deadline = Instant::now() + LOGIN_TIMEOUT;
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Err(WaitError::Cancelled);
        }
        if Instant::now() >= deadline {
            return Err(WaitError::Failed(IpcError::new(
                "login_expired",
                "AWS SSO 授权超时，请重新发起登录",
            )));
        }
        let accepted = tokio::time::timeout(Duration::from_millis(300), listener.accept()).await;
        let (mut socket, _) = match accepted {
            Err(_) => continue,
            Ok(Err(error)) => {
                return Err(WaitError::Failed(IpcError::new(
                    "login_failed",
                    format!("本地回调服务异常：{error}"),
                )));
            }
            Ok(Ok(value)) => value,
        };

        let mut buffer = vec![0u8; 8192];
        let read = tokio::time::timeout(Duration::from_secs(3), socket.read(&mut buffer)).await;
        let Ok(Ok(n)) = read else {
            let _ = respond(&mut socket, 400, "请求读取失败").await;
            continue;
        };
        let request = String::from_utf8_lossy(&buffer[..n]);
        let target = request
            .lines()
            .next()
            .and_then(|line| line.split_whitespace().nth(1))
            .unwrap_or("/");
        let url = match tauri::Url::parse(&format!("http://127.0.0.1{target}")) {
            Ok(url) => url,
            Err(_) => {
                let _ = respond(&mut socket, 404, "not found").await;
                continue;
            }
        };
        if url.path() != "/oauth/callback" {
            let _ = respond(&mut socket, 404, "not found").await;
            continue;
        }
        let params: Vec<(String, String)> = url.query_pairs().into_owned().collect();
        let get = |name: &str| {
            params
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value.clone())
        };
        if get("state").as_deref() != Some(expected_state) {
            let _ = respond(&mut socket, 400, "state 校验失败").await;
            return Err(WaitError::Failed(IpcError::new(
                "login_failed",
                "AWS 授权回调校验失败（state 不匹配），请重试",
            )));
        }
        if let Some(error) = get("error").or_else(|| get("error_description")) {
            let _ = respond(&mut socket, 400, "授权失败").await;
            return Err(WaitError::Failed(IpcError::new(
                "login_failed",
                format!("AWS SSO 授权失败：{error}"),
            )));
        }
        match get("code").filter(|value| !value.is_empty()) {
            Some(code) => {
                let _ = respond(&mut socket, 200, SUCCESS_PAGE).await;
                return Ok(code);
            }
            None => {
                let _ = respond(&mut socket, 400, "缺少授权码").await;
                return Err(WaitError::Failed(IpcError::new(
                    "login_failed",
                    "AWS 授权回调缺少授权码，请重新发起登录",
                )));
            }
        }
    }
}

struct IdcTokens {
    refresh_token: String,
}

async fn exchange_idc_code(
    client: &reqwest::Client,
    oidc_base: &str,
    registration: &IdcClientRegistration,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<IdcTokens, IpcError> {
    let response = client
        .post(format!("{oidc_base}/token"))
        .header("Content-Type", "application/json")
        .header("Connection", "close")
        .json(&serde_json::json!({
            "clientId": registration.client_id,
            "clientSecret": registration.client_secret,
            "grantType": "authorization_code",
            "redirectUri": redirect_uri,
            "code": code,
            "codeVerifier": verifier,
        }))
        .send()
        .await
        .map_err(|e| describe_request_error(&e))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(describe_http_error(status.as_u16(), &body));
    }
    let parsed: IdcTokenResponse = serde_json::from_str(&body)
        .map_err(|e| IpcError::new("login_failed", format!("AWS token 响应无法解析：{e}")))?;
    let refresh_token = parsed
        .refresh_token
        .filter(|token| !token.is_empty())
        .ok_or_else(|| {
            IpcError::new(
                "login_failed",
                "AWS SSO 授权成功但没有返回 refreshToken，请重试",
            )
        })?;
    Ok(IdcTokens { refresh_token })
}

/// 绑定任意空闲的 loopback 端口（AWS SSO OIDC 不限制端口）
fn bind_ephemeral_listener() -> Result<(TcpListener, u16), IpcError> {
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0))
        .map_err(|e| IpcError::new("login_failed", format!("无法启动本地授权回调服务：{e}")))?;
    listener
        .set_nonblocking(true)
        .map_err(|e| IpcError::new("login_failed", format!("本地回调端口设置失败：{e}")))?;
    let port = listener
        .local_addr()
        .map_err(|e| IpcError::new("login_failed", format!("无法获取本地回调端口：{e}")))?
        .port();
    let listener = TcpListener::from_std(listener)
        .map_err(|e| IpcError::new("login_failed", format!("本地回调端口不可用：{e}")))?;
    Ok((listener, port))
}

/// 与浏览器回调一致的 token 交换 redirect_uri（路径和 login_option 必须精确重建）
fn callback_redirect_uri(port: u16, path: &str, login_option: &str) -> String {
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    format!("http://localhost:{port}{path}?login_option={login_option}")
}

/// 一次登录拿到的凭据；social 与 IdC 共用（IdC 额外带 client 与 region）
struct AuthTokens {
    /// 建号用的 auth_method："social" / "idc"
    auth_method: &'static str,
    refresh_token: String,
    profile_arn: Option<String>,
    /// IdC 刷新必需的 OIDC client 凭据
    client_id: Option<String>,
    client_secret: Option<String>,
    /// IdC 所属 AWS Region
    region: Option<String>,
    /// 既有的 provider 展示名（Google / Github / BuilderId / Enterprise）
    provider: String,
}

async fn exchange_code(
    client: &reqwest::Client,
    base: &str,
    code: &str,
    verifier: &str,
    redirect_uri: &str,
) -> Result<AuthTokens, IpcError> {
    let response = client
        .post(format!("{base}{TOKEN_PATH}"))
        .header("Accept", "application/json, text/plain, */*")
        .header("Content-Type", "application/json")
        .header("Connection", "close")
        .json(&serde_json::json!({
            "code": code,
            "code_verifier": verifier,
            "redirect_uri": redirect_uri,
        }))
        .send()
        .await
        .map_err(|e| describe_request_error(&e))?;

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if !status.is_success() {
        return Err(describe_http_error(status.as_u16(), &body));
    }
    let parsed: TokenResponse = serde_json::from_str(&body)
        .map_err(|e| IpcError::new("login_failed", format!("登录响应无法解析：{e}")))?;
    let refresh_token = parsed
        .refresh_token
        .filter(|token| !token.is_empty())
        .ok_or_else(|| {
            IpcError::new(
                "login_failed",
                "登录成功但服务端没有返回 refreshToken，请重试",
            )
        })?;
    Ok(AuthTokens {
        auth_method: "social",
        refresh_token,
        profile_arn: parsed.profile_arn.filter(|arn| !arn.is_empty()),
        client_id: None,
        client_secret: None,
        region: None,
        provider: String::new(),
    })
}

/// 创建账号 → 验活 → 启用（复用 Kiro IDE / KAM 导入的约定）
async fn create_account(
    core: &crate::state::Core,
    tokens: AuthTokens,
) -> Result<(u64, bool), IpcError> {
    let admin = core.admin();
    let hash = refresh_token_hash(&tokens.refresh_token);
    if let Some(existing) = admin
        .get_all_credentials()
        .credentials
        .iter()
        .find(|item| item.refresh_token_hash.as_deref() == Some(hash.as_str()))
    {
        return Ok((existing.id, !existing.disabled));
    }

    let provider = tokens.provider.clone();
    let request = AddCredentialRequest {
        refresh_token: tokens.refresh_token,
        auth_method: tokens.auth_method.to_string(),
        provider: Some(provider.clone()),
        profile_arn: tokens.profile_arn,
        client_id: tokens.client_id,
        client_secret: tokens.client_secret,
        region: tokens.region.clone(),
        auth_region: tokens.region,
        nickname: Some(format!("浏览器登录 · {provider}")),
        disabled: true,
        ..Default::default()
    };
    let created = admin
        .add_credential(request)
        .await
        .map_err(IpcError::internal)?;
    let id = created.credential_id;
    let verified = admin.get_balance(id).await.is_ok();
    if verified {
        admin
            .set_disabled(id, false)
            .await
            .map_err(IpcError::internal)?;
    }
    Ok((id, verified))
}

/// 选取一个可用且被 Kiro 允许的回调端口
fn bind_callback_listener() -> Result<(TcpListener, u16), IpcError> {
    for port in CALLBACK_PORTS {
        if let Ok(listener) = std::net::TcpListener::bind(("127.0.0.1", port)) {
            listener
                .set_nonblocking(true)
                .map_err(|e| IpcError::new("login_failed", format!("本地回调端口设置失败：{e}")))?;
            let listener = TcpListener::from_std(listener)
                .map_err(|e| IpcError::new("login_failed", format!("本地回调端口不可用：{e}")))?;
            return Ok((listener, port));
        }
    }
    Err(IpcError::new(
        "login_failed",
        "Kiro 允许的回调端口都被占用，请稍后重试（3128 / 4649 / 6588 / 8008 / 9091 / 49xxx / 5xxxx）",
    ))
}

fn portal_url(state: &str, challenge: &str, port: u16) -> Result<tauri::Url, IpcError> {
    let mut url = tauri::Url::parse(PORTAL_URL)
        .map_err(|e| IpcError::new("login_failed", format!("登录页地址无效：{e}")))?;
    url.query_pairs_mut()
        .append_pair("state", state)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("redirect_uri", &format!("http://localhost:{port}"))
        .append_pair("redirect_from", "KiroIDE")
        // 只列出本应用实现了完整流程的方式：Builder ID / 组织 SSO 在门户回调后还要
        // 再跑一段 AWS SSO OIDC 授权，由 complete_login 接续。
        .append_pair("signin_methods", "google,github,builderid,awsidc");
    Ok(url)
}

/// 登录方式：前两种门户直接给 code，后两种要在门户之后接一段 AWS SSO OIDC 授权
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum LoginKind {
    Social,
    Idc,
}

/// 把门户的 `login_option` 映射成登录方式与展示用的 provider
fn login_kind(value: &str) -> Option<LoginKind> {
    match value.trim().to_ascii_lowercase().as_str() {
        "google" | "github" => Some(LoginKind::Social),
        "builderid" | "awsidc" => Some(LoginKind::Idc),
        _ => None,
    }
}

fn provider_from_login_option(value: &str) -> Option<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "google" => Some("Google".to_string()),
        "github" => Some("Github".to_string()),
        "builderid" => Some("BuilderId".to_string()),
        "awsidc" => Some("Enterprise".to_string()),
        _ => None,
    }
}

fn random_token(bytes: usize) -> Result<String, IpcError> {
    let mut buffer = vec![0u8; bytes];
    getrandom::fill(&mut buffer)
        .map_err(|e| IpcError::new("login_failed", format!("无法生成登录随机数：{e}")))?;
    Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buffer))
}

fn code_challenge(verifier: &str) -> String {
    let digest = Sha256::digest(verifier.as_bytes());
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(digest)
}

async fn respond(
    socket: &mut tokio::net::TcpStream,
    status: u16,
    body: &str,
) -> std::io::Result<()> {
    let reason = match status {
        200 => "OK",
        400 => "Bad Request",
        _ => "Not Found",
    };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
        body.len()
    );
    socket.write_all(response.as_bytes()).await
}

const SUCCESS_PAGE: &str = "<!doctype html><html lang=\"zh-CN\"><head><meta charset=\"utf-8\"><title>登录成功</title>\
<style>body{font-family:-apple-system,BlinkMacSystemFont,\"PingFang SC\",sans-serif;display:flex;min-height:100vh;\
align-items:center;justify-content:center;background:#F7F3EC;color:#2B241C;margin:0}\
main{text-align:center;padding:32px}h1{font-size:20px;margin:0 0 8px}p{color:#73685B;margin:0}</style></head>\
<body><main><h1>登录成功</h1><p>可以关闭此页面并返回 KiroProxy。</p></main></body></html>";

fn proxy_of(config: &Config) -> Option<ProxyConfig> {
    let url = config.proxy_url.clone()?;
    let mut proxy = ProxyConfig::new(url);
    if let (Some(username), Some(password)) = (
        config.proxy_username.as_deref(),
        config.proxy_password.as_deref(),
    ) {
        proxy = proxy.with_auth(username, password);
    }
    Some(proxy)
}

fn failed_status(provider: Option<String>, error: &IpcError) -> OauthStatus {
    OauthStatus {
        phase: OauthPhase::Failed,
        provider,
        verification_url: None,
        message: Some(error.message.clone()),
        credential_id: None,
    }
}

fn cancelled_status(provider: Option<String>) -> OauthStatus {
    OauthStatus {
        phase: OauthPhase::Cancelled,
        provider,
        verification_url: None,
        message: Some("已取消登录".to_string()),
        credential_id: None,
    }
}

fn describe_request_error(e: &reqwest::Error) -> IpcError {
    use std::error::Error as _;
    let mut chain = Vec::new();
    let mut source = e.source();
    while let Some(err) = source {
        chain.push(err.to_string());
        source = err.source();
    }
    let detail = chain.last().cloned().unwrap_or_else(|| e.to_string());
    let lower = chain.join(" | ").to_lowercase();
    let hint = if e.is_timeout() {
        "连接 Kiro 授权服务超时"
    } else if lower.contains("dns") || lower.contains("resolve") {
        "无法解析授权服务域名，请检查网络或 DNS"
    } else {
        "无法连接 Kiro 授权服务（国内网络请在 设置 → 网络与代理 配置上游代理）"
    };
    IpcError::new("login_failed", format!("{hint}：{detail}"))
}

fn describe_http_error(status: u16, body: &str) -> IpcError {
    let lowered = body.to_ascii_lowercase();
    let message = if status == 403 && lowered.contains("cloudfront") {
        format!(
            "请求被 CloudFront 拦截（当前 IP 可能被限制），请稍后重试或更换网络/代理：{}",
            truncate(body, 160)
        )
    } else {
        format!("授权服务返回 HTTP {status}：{}", truncate(body, 200))
    };
    IpcError::new("login_failed", message)
}

fn truncate(value: &str, max: usize) -> String {
    if value.chars().count() <= max {
        return value.to_string();
    }
    let head: String = value.chars().take(max).collect();
    format!("{head}…")
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TokenResponse {
    #[serde(default)]
    #[allow(dead_code)]
    access_token: Option<String>,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    profile_arn: Option<String>,
    #[serde(default)]
    #[allow(dead_code)]
    expires_in: Option<f64>,
}

/// AWS SSO OIDC `client/register` 响应（只取刷新要用的两个字段）
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdcRegisterResponse {
    client_id: String,
    client_secret: String,
}

/// AWS SSO OIDC `token` 响应
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct IdcTokenResponse {
    #[serde(default)]
    refresh_token: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn portal_url_carries_pkce_and_loopback_redirect() {
        let challenge = code_challenge("verifier");
        let url = portal_url("state-1", &challenge, 3128).unwrap();
        let text = url.as_str();
        assert!(text.starts_with("https://app.kiro.dev/signin?"));
        assert!(text.contains("state=state-1"));
        assert!(text.contains(&format!("code_challenge={challenge}")));
        assert!(text.contains("code_challenge_method=S256"));
        assert!(text.contains("redirect_uri=http%3A%2F%2Flocalhost%3A3128"));
        assert!(text.contains("redirect_from=KiroIDE"));
        // 门户支持的方式与后端实现的流程一致
        assert!(text.contains("signin_methods=google%2Cgithub%2Cbuilderid%2Cawsidc"));
    }

    #[test]
    fn code_challenge_is_base64url_sha256_without_padding() {
        let challenge = code_challenge("testverifier123");
        assert_eq!(challenge.len(), 43);
        assert!(!challenge.contains('='));
        assert!(!challenge.contains('+'));
        assert!(!challenge.contains('/'));
    }

    #[test]
    fn callback_parsing_checks_state_and_code() {
        let ok = parse_callback(
            "/oauth/callback?login_option=google&code=abc&state=s1",
            "s1",
        )
        .unwrap()
        .unwrap();
        assert_eq!(ok.code.as_deref(), Some("abc"));
        assert_eq!(ok.login_option, "google");
        assert_eq!(ok.path, "/oauth/callback");

        // 非回调路径返回 None（继续等待）
        assert!(parse_callback("/favicon.ico", "s1").unwrap().is_none());

        // state 不匹配直接失败
        let wrong = parse_callback("/oauth/callback?code=abc&state=bad", "s1").unwrap_err();
        assert!(wrong.message.contains("state"));

        // Social 缺少 code
        let missing =
            parse_callback("/signin/callback?state=s1&login_option=github", "s1").unwrap_err();
        assert!(missing.message.contains("授权码"));
    }

    #[test]
    fn idc_callback_without_code_is_accepted_with_issuer() {
        // Builder ID / 组织 SSO 的回调没有 code，但带 issuer_url / idc_region：
        // 解析要放行，交给后面的 AWS SSO OIDC 授权
        let builder = parse_callback(
            "/signin/callback?login_option=builderid&issuer_url=https%3A%2F%2Fview.awsapps.com%2Fstart&idc_region=us-east-1&state=s1",
            "s1",
        )
        .unwrap()
        .unwrap();
        assert_eq!(builder.code, None);
        assert_eq!(builder.login_option, "builderid");
        assert_eq!(
            builder.issuer_url.as_deref(),
            Some("https://view.awsapps.com/start")
        );
        assert_eq!(builder.idc_region.as_deref(), Some("us-east-1"));

        let enterprise = parse_callback(
            "/oauth/callback?login_option=awsidc&issuer_url=https%3A%2F%2Fd-123.awsapps.com%2Fstart&idc_region=eu-central-1&state=s1",
            "s1",
        )
        .unwrap()
        .unwrap();
        assert_eq!(enterprise.code, None);
        assert_eq!(enterprise.idc_region.as_deref(), Some("eu-central-1"));
    }

    #[test]
    fn unsupported_login_option_is_rejected() {
        for option in ["external_idp", "internal", ""] {
            let target = format!("/oauth/callback?state=s1&login_option={option}&issuer_url=x");
            let error = parse_callback(&target, "s1").unwrap_err();
            assert_eq!(error.code, "login_unsupported", "login_option={option}");
            assert!(
                error.message.contains("暂不支持"),
                "login_option={option} message={}",
                error.message
            );
            assert!(!error.message.contains("授权码"), "login_option={option}");
        }
    }

    #[test]
    fn maps_login_option_to_kind_and_provider() {
        assert_eq!(login_kind("google"), Some(LoginKind::Social));
        assert_eq!(login_kind("GitHub"), Some(LoginKind::Social));
        assert_eq!(login_kind("builderid"), Some(LoginKind::Idc));
        assert_eq!(login_kind("awsidc"), Some(LoginKind::Idc));
        assert_eq!(login_kind("external_idp"), None);

        assert_eq!(provider_from_login_option("google").unwrap(), "Google");
        assert_eq!(provider_from_login_option("GitHub").unwrap(), "Github");
        assert_eq!(
            provider_from_login_option("builderid").unwrap(),
            "BuilderId"
        );
        assert_eq!(provider_from_login_option("awsidc").unwrap(), "Enterprise");
    }

    #[test]
    fn idc_authorize_url_carries_pkce_and_scopes() {
        let url = idc_authorize_url(
            "https://oidc.us-east-1.amazonaws.com",
            "client-1",
            "http://127.0.0.1:5555/oauth/callback",
            "state-1",
            "challenge-1",
        )
        .unwrap();
        let text = url.as_str();
        assert!(text.starts_with("https://oidc.us-east-1.amazonaws.com/authorize?"));
        assert!(text.contains("response_type=code"));
        assert!(text.contains("client_id=client-1"));
        assert!(text.contains("state=state-1"));
        assert!(text.contains("code_challenge=challenge-1"));
        assert!(text.contains("code_challenge_method=S256"));
        // scopes 用逗号连接，需被 URL 编码
        assert!(text.contains("codewhisperer%3Acompletions"));
    }

    #[test]
    fn exchange_redirect_uri_rebuilds_path_and_option() {
        assert_eq!(
            callback_redirect_uri(53153, "/oauth/callback", "github"),
            "http://localhost:53153/oauth/callback?login_option=github"
        );
        // 兼容没有前导斜杠的路径
        assert_eq!(
            callback_redirect_uri(8008, "signin/callback", "google"),
            "http://localhost:8008/signin/callback?login_option=google"
        );
    }

    /// 真实回环验证：本地服务收到 AWS 授权回调后能取出 code，并先回 200 再返回。
    #[tokio::test]
    async fn idc_callback_socket_returns_authorization_code() {
        let (listener, port) = bind_ephemeral_listener().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));

        let handle = tokio::spawn(async move {
            wait_for_idc_callback(listener, "expected-state", &cancel).await
        });

        // 先打一个非回调路径，确认服务会继续等待而不是失败
        let mut probe = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        probe
            .write_all(b"GET /favicon.ico HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n")
            .await
            .unwrap();
        let mut buf = [0u8; 64];
        let n = probe.read(&mut buf).await.unwrap();
        assert!(String::from_utf8_lossy(&buf[..n]).starts_with("HTTP/1.1 404"));

        // 再送真正带 code 的回调
        let mut socket = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        socket
            .write_all(
                b"GET /oauth/callback?code=the-code&state=expected-state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            )
            .await
            .unwrap();
        let mut buf = [0u8; 512];
        let n = socket.read(&mut buf).await.unwrap();
        assert!(
            String::from_utf8_lossy(&buf[..n]).starts_with("HTTP/1.1 200"),
            "回调页应返回 200，实际: {}",
            String::from_utf8_lossy(&buf[..n])
        );

        let code = handle.await.unwrap().unwrap();
        assert_eq!(code, "the-code");
    }

    /// state 不匹配时必须拒绝，不能把别人的 code 当成本次登录的结果
    #[tokio::test]
    async fn idc_callback_rejects_state_mismatch() {
        let (listener, port) = bind_ephemeral_listener().unwrap();
        let cancel = Arc::new(AtomicBool::new(false));
        let handle = tokio::spawn(async move {
            wait_for_idc_callback(listener, "expected-state", &cancel).await
        });

        let mut socket = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        socket
            .write_all(
                b"GET /oauth/callback?code=x&state=other-state HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n",
            )
            .await
            .unwrap();
        let mut buf = [0u8; 256];
        let _ = socket.read(&mut buf).await;

        match handle.await.unwrap() {
            Err(WaitError::Failed(error)) => assert!(error.message.contains("state")),
            other => panic!("state 不匹配应失败，实际: {other:?}"),
        }
    }

    #[test]
    fn random_token_is_url_safe() {
        let token = random_token(24).unwrap();
        assert_eq!(token.len(), 32);
        assert!(
            token
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        );
    }

    #[test]
    fn cloudfront_block_has_readable_hint() {
        let error = describe_http_error(403, "Generated by cloudfront");
        assert!(error.message.contains("CloudFront"));
    }
}
