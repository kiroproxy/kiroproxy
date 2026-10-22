// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 浏览器登录（与 Kiro IDE / kiro-cli 相同的门户授权流程）。
//!
//! 流程：
//! 1. 在本机 10 个被 Kiro 授权服务白名单允许的回调端口上启动一次性本地 HTTP 服务；
//! 2. 打开 `https://app.kiro.dev/signin`（Kiro 自己的登录页），由网页让用户选择
//!    Google / GitHub 账号并完成登录；
//! 3. 网页回跳到 `http://localhost:<port>/oauth/callback?login_option=…&code=…&state=…`，
//!    应用校验 state 后用 code + PKCE verifier 换取 accessToken / refreshToken / profileArn；
//! 4. 以禁用状态创建账号 → 余额验活 → 启用（与 Kiro IDE / KAM 导入一致）。
//!
//! 注意：Kiro 的授权服务只接受预注册的回调地址——`kiro://` 自定义协议或下列固定 loopback
//! 端口，所以端口不能随便选；token 交换时 `redirect_uri` 必须与回调路径和 `login_option`
//! 完全一致。该接口属于 Kiro 未公开契约，服务端变更或 CloudFront 按 IP 拦截时会在错误信息里说明。

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

/// Kiro 自己的登录页（网页里选择 Google / GitHub 并选择账号）
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
        message: Some("请在浏览器中选择 Google 或 GitHub 并完成登录".to_string()),
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
                complete_login(task_app.clone(), &client, &base, &callback, &verifier, port).await
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

enum WaitError {
    Cancelled,
    Failed(IpcError),
}

#[derive(Debug)]
struct Callback {
    code: String,
    login_option: String,
    path: String,
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
                let _ = respond(&mut socket, 200, SUCCESS_PAGE).await;
                return Ok(callback);
            }
            Ok(None) => {
                // 非回调路径（favicon 等）：回 404 继续等待
                let _ = respond(&mut socket, 404, "not found").await;
            }
            Err(error) => {
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
    let code = get("code")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| IpcError::new("login_failed", "登录回调缺少授权码，请重新发起登录"))?;
    Ok(Some(Callback {
        code,
        login_option: get("login_option").unwrap_or_default(),
        path,
    }))
}

async fn complete_login(
    app: AppHandle,
    client: &reqwest::Client,
    base: &str,
    callback: &Callback,
    verifier: &str,
    port: u16,
) -> OauthStatus {
    let provider = match provider_from_login_option(&callback.login_option) {
        Some(provider) => provider,
        None => {
            let shown = if callback.login_option.is_empty() {
                "当前方式".to_string()
            } else {
                callback.login_option.clone()
            };
            return failed_status(
                None,
                &IpcError::new(
                    "login_unsupported",
                    format!("暂不支持 {shown} 登录，请在网页中选择 Google 或 GitHub"),
                ),
            );
        }
    };

    publish(
        &app,
        OauthStatus {
            phase: OauthPhase::Verifying,
            provider: Some(provider.clone()),
            verification_url: None,
            message: Some("登录成功，正在验证账号…".to_string()),
            credential_id: None,
        },
    );

    // token 交换的 redirect_uri 必须与回调路径和 login_option 完全一致
    let redirect_uri = callback_redirect_uri(port, &callback.path, &callback.login_option);
    let tokens = match exchange_code(client, base, &callback.code, verifier, &redirect_uri).await {
        Ok(tokens) => tokens,
        Err(error) => return failed_status(Some(provider), &error),
    };

    let core = match app.state::<AppState>().core() {
        Ok(core) => core,
        Err(error) => return failed_status(Some(provider), &error),
    };
    match create_account(&core, &provider, tokens).await {
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

/// 与浏览器回调一致的 token 交换 redirect_uri（路径和 login_option 必须精确重建）
fn callback_redirect_uri(port: u16, path: &str, login_option: &str) -> String {
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    format!("http://localhost:{port}{path}?login_option={login_option}")
}

struct AuthTokens {
    refresh_token: String,
    profile_arn: Option<String>,
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
        refresh_token,
        profile_arn: parsed.profile_arn.filter(|arn| !arn.is_empty()),
    })
}

/// 创建账号 → 验活 → 启用（复用 Kiro IDE / KAM 导入的约定）
async fn create_account(
    core: &crate::state::Core,
    provider: &str,
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

    let request = AddCredentialRequest {
        refresh_token: tokens.refresh_token,
        auth_method: "social".to_string(),
        provider: Some(provider.to_string()),
        profile_arn: tokens.profile_arn,
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
        .append_pair("redirect_from", "KiroIDE");
    Ok(url)
}

fn provider_from_login_option(value: &str) -> Option<String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "google" => Some("Google".to_string()),
        "github" => Some("Github".to_string()),
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
        assert_eq!(ok.code, "abc");
        assert_eq!(ok.login_option, "google");
        assert_eq!(ok.path, "/oauth/callback");

        // 非回调路径返回 None（继续等待）
        assert!(parse_callback("/favicon.ico", "s1").unwrap().is_none());

        // state 不匹配直接失败
        let wrong = parse_callback("/oauth/callback?code=abc&state=bad", "s1").unwrap_err();
        assert!(wrong.message.contains("state"));

        // 缺少 code
        let missing =
            parse_callback("/signin/callback?state=s1&login_option=github", "s1").unwrap_err();
        assert!(missing.message.contains("授权码"));
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

    #[test]
    fn maps_login_option_to_provider() {
        assert_eq!(provider_from_login_option("google").unwrap(), "Google");
        assert_eq!(provider_from_login_option("GitHub").unwrap(), "Github");
        assert!(provider_from_login_option("builderid").is_none());
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
