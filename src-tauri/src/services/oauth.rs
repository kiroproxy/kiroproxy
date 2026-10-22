// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 浏览器登录（Kiro 官方 CLI 同款的 device code flow）。
//!
//! 流程：
//! 1. 向 `https://prod.{region}.auth.desktop.kiro.dev/oauth/device/authorization` 申请一次性授权链接；
//! 2. 打开系统浏览器，用户在网页上用 Google / GitHub 完成授权；
//! 3. 应用按服务端给的间隔轮询 `/oauth/device/poll`，拿到 accessToken / refreshToken / profileArn；
//! 4. 以禁用状态创建账号 → 余额验活 → 启用（与 Kiro IDE / KAM 导入一致）。
//!
//! 这条流程不需要 redirect_uri、PKCE 或 client secret，也不占用本地端口（Kiro 的授权码
//! 流程有 redirect_uri 白名单，第三方应用用不了），因此是桌面端最稳妥的方式。
//! 该接口属于 Kiro 未公开契约，服务端变更或 CloudFront 按 IP 拦截时会在错误信息里说明原因。

use crate::error::IpcError;
use crate::state::AppState;
use kiro_core::admin::types::AddCredentialRequest;
use kiro_core::http_client::{ProxyConfig, build_client};
use kiro_core::kam::refresh_token_hash;
use kiro_core::model::config::Config;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_opener::OpenerExt;

/// 登录状态事件：payload 为 [`OauthStatus`]
pub const OAUTH_STATUS_EVENT: &str = "oauth://status";

const DEVICE_PATH: &str = "/oauth/device/authorization";
const POLL_PATH: &str = "/oauth/device/poll";
/// `kiro-cli` 是 kiro-cli 官方使用的客户端标识（大小写两种写法兼容）
const CLIENT_IDS: [&str; 2] = ["kiro-cli", "Kiro-CLI"];
const HTTP_TIMEOUT_SECS: u64 = 20;
/// 服务端没给过期时间时的兜底（10 分钟）
const FALLBACK_TTL: Duration = Duration::from_secs(10 * 60);
/// slow_down 时的间隔增量
const SLOW_DOWN_STEP: Duration = Duration::from_secs(5);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum OauthPhase {
    Idle,
    /// 已打开浏览器，等待用户完成授权
    Waiting,
    /// 已拿到 token，正在创建并验证账号
    Verifying,
    Success,
    Failed,
    Cancelled,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthStatus {
    pub phase: OauthPhase,
    /// "Google" / "Github"
    pub provider: Option<String>,
    /// 网页上显示的配对码（有就展示，方便用户核对）
    pub user_code: Option<String>,
    pub verification_url: Option<String>,
    pub message: Option<String>,
    pub credential_id: Option<u64>,
}

impl OauthStatus {
    fn idle() -> Self {
        Self {
            phase: OauthPhase::Idle,
            provider: None,
            user_code: None,
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

/// 启动浏览器登录：申请授权链接并打开浏览器，然后后台轮询结果。
pub async fn start(app: AppHandle, provider: String) -> Result<OauthStatus, IpcError> {
    let provider = normalize_provider(&provider)?;
    let (config, core) = {
        let state = app.state::<AppState>();
        let core = state.core()?;
        let config = core.config.read().clone();
        (config, core)
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
    let base = auth_base(&config);

    let authorization = match authorize(&client, &base, &provider).await {
        Ok(value) => value,
        Err(error) => {
            end_session(&app.state::<OauthState>(), &cancel);
            publish(&app, failed_status(Some(provider.clone()), &error));
            return Err(error);
        }
    };

    if cancel.load(Ordering::SeqCst) {
        end_session(&app.state::<OauthState>(), &cancel);
        let status = cancelled_status(Some(provider.clone()));
        publish(&app, status.clone());
        return Ok(status);
    }

    let url = authorization
        .verification_uri_complete
        .clone()
        .or_else(|| authorization.verification_uri.clone())
        .ok_or_else(|| IpcError::new("login_failed", "授权服务没有返回登录链接，请稍后重试"))?;
    if let Err(e) = app.opener().open_url(url.clone(), None::<&str>) {
        end_session(&app.state::<OauthState>(), &cancel);
        let error = IpcError::new("login_failed", format!("无法打开浏览器：{e}"));
        publish(&app, failed_status(Some(provider.clone()), &error));
        return Err(error);
    }

    let status = OauthStatus {
        phase: OauthPhase::Waiting,
        provider: Some(provider.clone()),
        user_code: authorization.user_code.clone(),
        verification_url: Some(url),
        message: None,
        credential_id: None,
    };
    publish(&app, status.clone());

    let poll_client = client.clone();
    let poll_app = app.clone();
    let device_code = authorization.device_code.clone();
    let interval = authorization.interval();
    let ttl = authorization.ttl();
    tauri::async_runtime::spawn(async move {
        poll_loop(
            poll_app.clone(),
            poll_client,
            base,
            device_code,
            provider,
            interval,
            ttl,
            cancel,
            core,
        )
        .await;
    });

    Ok(status)
}

/// 重新打开当前登录的授权页（用户误关浏览器时用）；只打开自己申请到的链接
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

#[allow(clippy::too_many_arguments)]
async fn poll_loop(
    app: AppHandle,
    client: reqwest::Client,
    base: String,
    device_code: String,
    provider: String,
    mut interval: Duration,
    ttl: Duration,
    cancel: Arc<AtomicBool>,
    core: Arc<crate::state::Core>,
) {
    let state = app.state::<OauthState>();
    let deadline = Instant::now() + ttl;

    loop {
        if cancel.load(Ordering::SeqCst) {
            end_session(&state, &cancel);
            publish(&app, cancelled_status(Some(provider)));
            return;
        }
        if Instant::now() >= deadline {
            end_session(&state, &cancel);
            publish(
                &app,
                failed_status(
                    Some(provider),
                    &IpcError::new("login_expired", "授权已过期，请重新发起登录"),
                ),
            );
            return;
        }
        tokio::time::sleep(interval).await;

        match poll_once(&client, &base, &device_code).await {
            Ok(PollOutcome::Pending) => {}
            Ok(PollOutcome::SlowDown) => interval += SLOW_DOWN_STEP,
            Ok(PollOutcome::Authorized(tokens)) => {
                end_session(&state, &cancel);
                publish(
                    &app,
                    OauthStatus {
                        phase: OauthPhase::Verifying,
                        provider: Some(provider.clone()),
                        user_code: None,
                        verification_url: state.status.lock().verification_url.clone(),
                        message: Some("授权成功，正在验证账号…".to_string()),
                        credential_id: None,
                    },
                );
                let result = create_account(&core, &provider, tokens).await;
                let status = match result {
                    Ok((credential_id, verified)) => OauthStatus {
                        phase: OauthPhase::Success,
                        provider: Some(provider),
                        user_code: None,
                        verification_url: None,
                        message: Some(if verified {
                            "账号已添加并启用".to_string()
                        } else {
                            "账号已添加，但验活失败，暂时保持禁用".to_string()
                        }),
                        credential_id: Some(credential_id),
                    },
                    Err(error) => failed_status(Some(provider), &error),
                };
                publish(&app, status);
                return;
            }
            Err(error) => {
                end_session(&state, &cancel);
                publish(&app, failed_status(Some(provider), &error));
                return;
            }
        }
    }
}

enum PollOutcome {
    Pending,
    SlowDown,
    Authorized(DeviceTokens),
}

struct DeviceTokens {
    refresh_token: String,
    profile_arn: Option<String>,
}

async fn authorize(
    client: &reqwest::Client,
    base: &str,
    provider: &str,
) -> Result<DeviceAuthorization, IpcError> {
    let mut last_error = None;
    for client_id in CLIENT_IDS {
        let request = serde_json::json!({
            "clientId": client_id,
            "loginProvider": provider,
        });
        let response = client
            .post(format!("{base}{DEVICE_PATH}"))
            .header("Accept", "application/json, text/plain, */*")
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .json(&request)
            .send()
            .await;
        match response {
            Ok(response) => {
                let status = response.status();
                let body = response.text().await.unwrap_or_default();
                if !status.is_success() {
                    last_error = Some(describe_http_error(status.as_u16(), &body));
                    continue;
                }
                return serde_json::from_str::<DeviceAuthorization>(&body).map_err(|e| {
                    IpcError::new("login_failed", format!("授权服务响应无法解析：{e}"))
                });
            }
            Err(e) => last_error = Some(describe_request_error(&e)),
        }
    }
    Err(last_error
        .unwrap_or_else(|| IpcError::new("login_failed", "无法连接 Kiro 授权服务，请稍后重试")))
}

async fn poll_once(
    client: &reqwest::Client,
    base: &str,
    device_code: &str,
) -> Result<PollOutcome, IpcError> {
    let mut last_error = None;
    for client_id in CLIENT_IDS {
        let request = serde_json::json!({
            "clientId": client_id,
            "deviceCode": device_code,
        });
        let response = client
            .post(format!("{base}{POLL_PATH}"))
            .header("Accept", "application/json, text/plain, */*")
            .header("Content-Type", "application/json")
            .header("Connection", "close")
            .json(&request)
            .send()
            .await;
        let response = match response {
            Ok(response) => response,
            Err(e) => {
                last_error = Some(describe_request_error(&e));
                continue;
            }
        };
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        let parsed = serde_json::from_str::<DevicePoll>(&body).ok();

        // 授权未完成时服务端可能回 400/428，也返回非成功状态；以 body 里的 status/error 为准
        if let Some(poll) = parsed {
            let state = poll.status.as_deref().unwrap_or("").to_ascii_lowercase();
            match state.as_str() {
                "authorization_pending" | "pending" => return Ok(PollOutcome::Pending),
                "slow_down" => return Ok(PollOutcome::SlowDown),
                "authorized" | "authorization_granted" => {
                    let refresh_token = poll.refresh_token.filter(|t| !t.is_empty());
                    return match refresh_token {
                        Some(refresh_token) => Ok(PollOutcome::Authorized(DeviceTokens {
                            refresh_token,
                            profile_arn: poll.profile_arn.filter(|arn| !arn.is_empty()),
                        })),
                        None => Err(IpcError::new(
                            "login_failed",
                            "授权成功但服务端没有返回 refreshToken，请重试",
                        )),
                    };
                }
                "expired_token" | "expired" => {
                    return Err(IpcError::new("login_expired", "授权已过期，请重新发起登录"));
                }
                "access_denied" | "denied" => {
                    return Err(IpcError::new("login_denied", "授权被拒绝"));
                }
                other if !other.is_empty() => {
                    return Err(IpcError::new("login_failed", format!("授权失败：{other}")));
                }
                _ => {}
            }
        }

        if !status.is_success() {
            last_error = Some(describe_http_error(status.as_u16(), &body));
            continue;
        }
        return Err(IpcError::new(
            "login_failed",
            format!("授权服务响应无法解析：{}", truncate(&body, 200)),
        ));
    }
    Err(last_error.unwrap_or_else(|| IpcError::new("login_failed", "轮询授权结果失败")))
}

/// 创建账号 → 验活 → 启用（复用 Kiro IDE / KAM 导入的约定）
async fn create_account(
    core: &crate::state::Core,
    provider: &str,
    tokens: DeviceTokens,
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

/// "google" / "github" → Kiro 的 "Google" / "Github"
fn normalize_provider(value: &str) -> Result<String, IpcError> {
    match value.trim().to_ascii_lowercase().as_str() {
        "google" => Ok("Google".to_string()),
        "github" | "git_hub" => Ok("Github".to_string()),
        other => Err(IpcError::new(
            "invalid_request",
            format!("不支持的登录方式：{other}"),
        )),
    }
}

fn auth_base(config: &Config) -> String {
    format!(
        "https://prod.{}.auth.desktop.kiro.dev",
        config.effective_auth_region()
    )
}

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
        user_code: None,
        verification_url: None,
        message: Some(error.message.clone()),
        credential_id: None,
    }
}

fn cancelled_status(provider: Option<String>) -> OauthStatus {
    OauthStatus {
        phase: OauthPhase::Cancelled,
        provider,
        user_code: None,
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

#[derive(Debug, Deserialize)]
struct DeviceAuthorization {
    #[serde(rename = "deviceCode", alias = "device_code", default)]
    device_code: String,
    #[serde(rename = "userCode", alias = "user_code", default)]
    user_code: Option<String>,
    #[serde(rename = "verificationUri", alias = "verification_uri", default)]
    verification_uri: Option<String>,
    #[serde(
        rename = "verificationUriComplete",
        alias = "verification_uri_complete",
        default
    )]
    verification_uri_complete: Option<String>,
    #[serde(
        rename = "expiresInMilliseconds",
        alias = "expires_in_milliseconds",
        default
    )]
    expires_in_milliseconds: Option<u64>,
    #[serde(
        rename = "intervalMilliseconds",
        alias = "interval_milliseconds",
        default
    )]
    interval_milliseconds: Option<u64>,
}

impl DeviceAuthorization {
    fn interval(&self) -> Duration {
        Duration::from_millis(self.interval_milliseconds.unwrap_or(5_000).max(1_000))
    }

    fn ttl(&self) -> Duration {
        match self.expires_in_milliseconds {
            Some(ms) if ms > 0 => Duration::from_millis(ms),
            _ => FALLBACK_TTL,
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DevicePoll {
    /// 服务端可能用 `status` 或 `error` 表示 pending / slow_down 等状态
    #[serde(default, alias = "error")]
    status: Option<String>,
    /// 目前只用 refreshToken 建号，accessToken 保留便于排障
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
    fn normalizes_provider_names() {
        assert_eq!(normalize_provider("google").unwrap(), "Google");
        assert_eq!(normalize_provider(" Google ").unwrap(), "Google");
        assert_eq!(normalize_provider("github").unwrap(), "Github");
        assert_eq!(normalize_provider("GitHub").unwrap(), "Github");
        assert!(normalize_provider("aws").is_err());
    }

    #[test]
    fn parses_device_authorization() {
        let json = r#"{
            "deviceCode": "dc-1",
            "userCode": "ABCD-EFGH",
            "verificationUri": "https://example.com/device",
            "verificationUriComplete": "https://example.com/device?code=ABCD-EFGH",
            "expiresInMilliseconds": 600000,
            "intervalMilliseconds": 3000
        }"#;
        let parsed: DeviceAuthorization = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.device_code, "dc-1");
        assert_eq!(parsed.user_code.as_deref(), Some("ABCD-EFGH"));
        assert_eq!(parsed.interval(), Duration::from_millis(3000));
        assert_eq!(parsed.ttl(), Duration::from_millis(600_000));
    }

    #[test]
    fn device_authorization_accepts_snake_case() {
        let json =
            r#"{"device_code":"dc","interval_milliseconds":100,"expires_in_milliseconds":0}"#;
        let parsed: DeviceAuthorization = serde_json::from_str(json).unwrap();
        assert_eq!(parsed.device_code, "dc");
        assert_eq!(parsed.ttl(), FALLBACK_TTL);
        // 间隔有下限，避免被服务端异常值打爆
        assert_eq!(parsed.interval(), Duration::from_millis(1000));
    }

    #[test]
    fn parses_poll_states() {
        let pending: DevicePoll =
            serde_json::from_str(r#"{"status":"authorization_pending"}"#).unwrap();
        assert_eq!(pending.status.as_deref(), Some("authorization_pending"));

        let slow: DevicePoll = serde_json::from_str(r#"{"status":"slow_down"}"#).unwrap();
        assert_eq!(slow.status.as_deref(), Some("slow_down"));

        let authorized: DevicePoll = serde_json::from_str(
            r#"{"status":"authorized","accessToken":"a","refreshToken":"r","profileArn":"arn:aws:codewhisperer:us-east-1:1:profile/x"}"#,
        )
        .unwrap();
        assert_eq!(authorized.status.as_deref(), Some("authorized"));
        assert_eq!(authorized.refresh_token.as_deref(), Some("r"));
        assert!(
            authorized
                .profile_arn
                .unwrap()
                .starts_with("arn:aws:codewhisperer")
        );
    }

    #[test]
    fn cloudfront_block_has_readable_hint() {
        let error = describe_http_error(403, "Generated by cloudfront");
        assert!(error.message.contains("CloudFront"));
    }
}
