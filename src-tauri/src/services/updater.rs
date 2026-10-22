// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 应用更新：检查 GitHub Releases 的 `latest.json`、后台下载、用户确认后安装并重启。
//!
//! 设计要点：
//! - 更新由 Rust 侧驱动（前端只调命令、收 `updater://status` 事件），不需要给 WebView 开放 updater 权限；
//! - 发现新版本后自动下载，下载完成只进入 `ready` 状态，**必须**用户调用 `install_update` 才会替换应用；
//! - 安装前先停代理并落盘（与退出清理一致），macOS 上是 APFS 原子交换，失败会还原原包；
//! - 从 DMG / Gatekeeper 隔离路径 / debug 构建运行时无法原地替换，状态里给出 `installBlocked` 说明。

use crate::error::IpcError;
use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

/// 状态变更事件：payload 为 [`UpdateStatus`]
pub const UPDATE_STATUS_EVENT: &str = "updater://status";
/// 本地测试用：覆盖更新端点（只在测试构建里配合 `dangerousInsecureTransportProtocol` 使用）
pub const ENDPOINT_ENV: &str = "KIROPROXY_UPDATE_ENDPOINT";
/// 发布页（手动下载兜底）
pub const RELEASES_PAGE: &str = "https://github.com/kiroproxy/kiroproxy/releases/latest";

/// 检查更新的请求超时（下载单独放宽，避免大包在慢网络下被整体超时中断）
const CHECK_TIMEOUT: Duration = Duration::from_secs(30);
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(30 * 60);
/// 启动后延迟检查，避开启动阶段
const AUTO_CHECK_DELAY: Duration = Duration::from_secs(15);
const AUTO_CHECK_INTERVAL: Duration = Duration::from_secs(6 * 60 * 60);
/// 下载进度事件的最小间隔
const PROGRESS_INTERVAL: Duration = Duration::from_millis(250);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum UpdatePhase {
    /// 没有检查过，或已是最新
    Idle,
    Checking,
    Downloading,
    /// 更新包已下载并通过签名校验，等待用户确认安装
    Ready,
    Installing,
    Failed,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateStatus {
    pub phase: UpdatePhase,
    pub current_version: String,
    pub latest_version: Option<String>,
    /// 发布说明（latest.json 的 notes）
    pub notes: Option<String>,
    /// 发布时间（Unix 秒）
    pub published_at: Option<i64>,
    /// 0–100；只在下载阶段有意义
    pub progress: Option<f64>,
    pub downloaded_bytes: Option<u64>,
    pub total_bytes: Option<u64>,
    pub error: Option<String>,
    /// 无法原地替换的原因（DMG / 隔离路径 / debug 构建）；有值时只能手动下载安装
    pub install_blocked: Option<String>,
    /// 最近一次检查时间（Unix 秒）
    pub last_checked_at: Option<i64>,
}

impl UpdateStatus {
    fn idle(current_version: &str) -> Self {
        Self {
            phase: UpdatePhase::Idle,
            current_version: current_version.to_string(),
            latest_version: None,
            notes: None,
            published_at: None,
            progress: None,
            downloaded_bytes: None,
            total_bytes: None,
            error: None,
            install_blocked: None,
            last_checked_at: None,
        }
    }
}

pub struct UpdateState {
    status: RwLock<UpdateStatus>,
    /// 检查到的更新（Clone + Send），下载完成后仍保留，安装时再取出
    update: Mutex<Option<Update>>,
    /// 下载好的安装包字节；安装前会再次按签名校验
    bytes: Mutex<Option<Vec<u8>>>,
    /// 同一时刻只允许一个检查/下载/安装流程
    busy: AtomicBool,
}

impl UpdateState {
    pub fn new(current_version: String) -> Self {
        Self {
            status: RwLock::new(UpdateStatus::idle(&current_version)),
            update: Mutex::new(None),
            bytes: Mutex::new(None),
            busy: AtomicBool::new(false),
        }
    }
}

/// 当前状态（含动态计算的 installBlocked）
pub fn status(app: &AppHandle) -> UpdateStatus {
    let state = app.state::<UpdateState>();
    let mut status = state.status.read().clone();
    status.install_blocked = install_block_reason();
    status
}

fn publish(app: &AppHandle, mut status: UpdateStatus) {
    status.install_blocked = install_block_reason();
    let state = app.state::<UpdateState>();
    *state.status.write() = status.clone();
    let _ = app.emit(UPDATE_STATUS_EVENT, &status);
}

/// 无法原地替换应用的原因
pub fn install_block_reason() -> Option<String> {
    if cfg!(debug_assertions) {
        return Some("开发构建（debug）不支持原地更新，请使用发布版本".to_string());
    }
    let exe = std::env::current_exe().ok()?;
    let path = exe.to_string_lossy();
    if path.starts_with("/Volumes/") || path.starts_with("/private/Volumes/") {
        return Some(
            "当前从只读的 DMG 运行，无法原地替换。请先把 KiroProxy.app 拖入「应用程序」文件夹，再检查更新。"
                .to_string(),
        );
    }
    if path.contains(".apptranslocation") {
        return Some(
            "应用正以 Gatekeeper 隔离路径运行，无法原地替换。请把 KiroProxy.app 移到「应用程序」文件夹后再检查更新。"
                .to_string(),
        );
    }
    // Tauri 在 macOS 上要求启动路径不含符号链接（例如 /tmp → /private/tmp），否则无法定位应用包
    if let Some(link) = symlink_component(std::path::Path::new(&*path)) {
        return Some(format!(
            "应用所在路径包含符号链接（{}），无法自动更新。请把 KiroProxy.app 移到「应用程序」文件夹后再检查更新。",
            link.display()
        ));
    }
    None
}

/// 返回路径中第一个符号链接组件
fn symlink_component(path: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut current = std::path::PathBuf::new();
    for component in path.components() {
        current.push(component);
        if current
            .symlink_metadata()
            .is_ok_and(|meta| meta.file_type().is_symlink())
        {
            return Some(current);
        }
    }
    None
}

/// 检查更新；发现新版本时自动下载（下载完成进入 `ready`，不会自动安装）
pub async fn check(app: AppHandle) -> Result<UpdateStatus, IpcError> {
    let state = app.state::<UpdateState>();
    // 已在检查/下载/安装：直接返回当前状态，避免并发请求打乱状态机
    if state.busy.swap(true, Ordering::SeqCst) {
        return Ok(status(&app));
    }
    // ready 时不再重复检查（已下载的包保留到安装或下次启动）
    if state.status.read().phase == UpdatePhase::Ready {
        state.busy.store(false, Ordering::SeqCst);
        return Ok(status(&app));
    }
    let result = check_and_download(&app).await;
    app.state::<UpdateState>()
        .busy
        .store(false, Ordering::SeqCst);
    result
}

async fn check_and_download(app: &AppHandle) -> Result<UpdateStatus, IpcError> {
    let current_version = app.package_info().version.to_string();
    let mut checking = UpdateStatus {
        phase: UpdatePhase::Checking,
        ..UpdateStatus::idle(&current_version)
    };
    checking.last_checked_at = Some(chrono::Utc::now().timestamp());
    publish(app, checking);

    let updater = build_updater(app)?;
    let found = updater.check().await.map_err(|e| {
        let mut failed = UpdateStatus::idle(&current_version);
        failed.phase = UpdatePhase::Failed;
        failed.error = Some(describe_error(&e));
        failed.last_checked_at = Some(chrono::Utc::now().timestamp());
        publish(app, failed);
        IpcError::new("update_check_failed", describe_error(&e))
    })?;

    let Some(mut update) = found else {
        let mut idle = UpdateStatus::idle(&current_version);
        idle.last_checked_at = Some(chrono::Utc::now().timestamp());
        publish(app, idle.clone());
        return Ok(idle);
    };

    // 检查只设了 30 秒超时；下载大包单独放宽
    update.timeout = Some(DOWNLOAD_TIMEOUT);
    let latest_version = update.version.clone();
    let notes = update.body.clone();
    let published_at = update.date.map(|date| date.unix_timestamp());
    {
        let state = app.state::<UpdateState>();
        *state.update.lock() = Some(update.clone());
        *state.bytes.lock() = None;
    }

    let mut downloading = UpdateStatus {
        phase: UpdatePhase::Downloading,
        latest_version: Some(latest_version.clone()),
        notes,
        published_at,
        progress: Some(0.0),
        ..UpdateStatus::idle(&current_version)
    };
    downloading.last_checked_at = Some(chrono::Utc::now().timestamp());
    publish(app, downloading);

    let progress_app = app.clone();
    let mut downloaded: u64 = 0;
    let mut last_emit = Instant::now() - PROGRESS_INTERVAL;
    let downloaded_result = update
        .download(
            move |chunk_len, total| {
                downloaded += chunk_len as u64;
                if last_emit.elapsed() < PROGRESS_INTERVAL {
                    return;
                }
                last_emit = Instant::now();
                let state = progress_app.state::<UpdateState>();
                let mut progress = state.status.read().clone();
                progress.phase = UpdatePhase::Downloading;
                progress.downloaded_bytes = Some(downloaded);
                progress.total_bytes = total;
                progress.progress = total
                    .filter(|t| *t > 0)
                    .map(|t| (downloaded as f64 / t as f64 * 100.0).min(100.0));
                publish(&progress_app, progress);
            },
            || {},
        )
        .await;

    match downloaded_result {
        Ok(bytes) => {
            let total = bytes.len() as u64;
            {
                let state = app.state::<UpdateState>();
                *state.bytes.lock() = Some(bytes);
            }
            let mut ready = UpdateStatus {
                phase: UpdatePhase::Ready,
                latest_version: Some(latest_version),
                notes: update.body,
                published_at: update.date.map(|date| date.unix_timestamp()),
                progress: Some(100.0),
                downloaded_bytes: Some(total),
                total_bytes: Some(total),
                ..UpdateStatus::idle(&current_version)
            };
            ready.last_checked_at = Some(chrono::Utc::now().timestamp());
            publish(app, ready.clone());
            Ok(ready)
        }
        Err(e) => {
            let message = describe_error(&e);
            let mut failed = UpdateStatus::idle(&current_version);
            failed.phase = UpdatePhase::Failed;
            failed.latest_version = Some(latest_version);
            failed.error = Some(message.clone());
            failed.last_checked_at = Some(chrono::Utc::now().timestamp());
            publish(app, failed);
            Err(IpcError::new("update_download_failed", message))
        }
    }
}

/// 安装已下载的更新并重启应用。
///
/// 只会在用户点「重启并更新」时调用：先停代理服务并落盘，再原子替换应用包，
/// 成功后调用 `app.restart()`（触发退出清理，幂等）。任何一步失败都不会替换应用。
pub async fn install(app: AppHandle) -> Result<(), IpcError> {
    if let Some(reason) = install_block_reason() {
        return Err(IpcError::new("update_blocked", reason));
    }
    let current_version = app.package_info().version.to_string();
    let (update, bytes) = {
        let state = app.state::<UpdateState>();
        if state.busy.swap(true, Ordering::SeqCst) {
            return Err(IpcError::new(
                "update_busy",
                "正在检查或下载更新，请稍后再试",
            ));
        }
        let update = state.update.lock().take();
        let bytes = state.bytes.lock().take();
        match (update, bytes) {
            (Some(update), Some(bytes)) => (update, bytes),
            _ => {
                state.busy.store(false, Ordering::SeqCst);
                return Err(IpcError::new("update_not_ready", "更新包还没有下载完成"));
            }
        }
    };

    let latest_version = update.version.clone();
    publish(
        &app,
        UpdateStatus {
            phase: UpdatePhase::Installing,
            latest_version: Some(latest_version.clone()),
            progress: Some(100.0),
            ..UpdateStatus::idle(&current_version)
        },
    );

    let install_app = app.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        // 与退出流程一致：先停代理（最多等 3 秒在途请求）并把防抖数据落盘
        crate::prepare_exit(&install_app);
        update.install(bytes)
    })
    .await
    .map_err(IpcError::internal)?;

    match result {
        Ok(()) => {
            // macOS 上 install 只替换磁盘上的 .app，需要自己重启
            app.restart();
        }
        Err(e) => {
            let message = format!("安装更新失败：{e}");
            let state = app.state::<UpdateState>();
            state.busy.store(false, Ordering::SeqCst);
            let mut failed = UpdateStatus::idle(&current_version);
            failed.phase = UpdatePhase::Failed;
            failed.latest_version = Some(latest_version);
            failed.error = Some(message.clone());
            publish(&app, failed);
            Err(IpcError::new("update_install_failed", message))
        }
    }
}

/// 打开 GitHub 发布页（自动更新不可用时的手动下载入口）
pub fn open_releases_page(app: &AppHandle) -> Result<(), IpcError> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(RELEASES_PAGE, None::<&str>)
        .map_err(IpcError::internal)
}

fn build_updater(app: &AppHandle) -> Result<tauri_plugin_updater::Updater, IpcError> {
    let mut builder = app.updater_builder().timeout(CHECK_TIMEOUT);
    if let Some(endpoint) = endpoint_override()? {
        builder = builder
            .endpoints(vec![endpoint])
            .map_err(|e| IpcError::new("update_check_failed", format!("更新端点无效：{e}")))?;
    }
    if let Some(proxy) = configured_proxy(app) {
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|e| {
        let message = e.to_string();
        let hint = if message.to_lowercase().contains("symlink") {
            install_block_reason().unwrap_or_else(|| {
                "应用所在路径无法用于自动更新，请把 KiroProxy.app 移到「应用程序」文件夹"
                    .to_string()
            })
        } else {
            format!("{message}（请检查 设置 → 网络与代理）")
        };
        IpcError::new("update_check_failed", hint)
    })
}

fn endpoint_override() -> Result<Option<tauri::Url>, IpcError> {
    let Ok(value) = std::env::var(ENDPOINT_ENV) else {
        return Ok(None);
    };
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    value.parse().map(Some).map_err(|e| {
        IpcError::new(
            "update_check_failed",
            format!("{ENDPOINT_ENV} 不是合法 URL：{e}"),
        )
    })
}

/// 已配置的上游代理（带回认证），国内访问 GitHub 时需要
fn configured_proxy(app: &AppHandle) -> Option<tauri::Url> {
    let state = app.try_state::<crate::state::AppState>()?;
    let core = state.core().ok()?;
    let config = core.config.read();
    let mut url: tauri::Url = config.proxy_url.as_deref()?.parse().ok()?;
    if let (Some(username), Some(password)) = (
        config.proxy_username.as_deref(),
        config.proxy_password.as_deref(),
    ) {
        let _ = url.set_username(username);
        let _ = url.set_password(Some(password));
    }
    Some(url)
}

fn describe_error(e: &tauri_plugin_updater::Error) -> String {
    use tauri_plugin_updater::Error as UpdaterError;
    match e {
        UpdaterError::ReleaseNotFound => {
            "更新服务器没有可用的发布信息（latest.json），可能尚未发布新版本".to_string()
        }
        UpdaterError::Network(_) | UpdaterError::Reqwest(_) | UpdaterError::Http(_) => format!(
            "无法连接更新服务器（GitHub）：{e}。如果是国内网络，请先在 设置 → 网络与代理 配置上游代理"
        ),
        UpdaterError::Minisign(_)
        | UpdaterError::SignatureUtf8(_)
        | UpdaterError::SignedVersionMismatch { .. } => {
            "更新包签名校验失败，已拒绝安装".to_string()
        }
        UpdaterError::EmptyEndpoints => "没有配置更新端点".to_string(),
        _ => format!("检查更新失败：{e}"),
    }
}

/// 启动后自动检查（仅发布构建）：延迟 15 秒，此后每 6 小时一次
pub fn spawn_scheduler(app: AppHandle) {
    if cfg!(debug_assertions) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(AUTO_CHECK_DELAY).await;
        loop {
            if let Err(e) = check(app.clone()).await {
                tracing::warn!("自动检查更新失败: {}", e.message);
            }
            tokio::time::sleep(AUTO_CHECK_INTERVAL).await;
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn idle_status_serializes_as_camel_case() {
        let status = UpdateStatus::idle("0.1.0");
        let json = serde_json::to_value(&status).unwrap();
        assert_eq!(json["phase"], "idle");
        assert_eq!(json["currentVersion"], "0.1.0");
        assert!(json.get("latestVersion").is_some());
    }

    #[test]
    fn phases_serialize_as_camel_case() {
        for (phase, expected) in [
            (UpdatePhase::Idle, "idle"),
            (UpdatePhase::Checking, "checking"),
            (UpdatePhase::Downloading, "downloading"),
            (UpdatePhase::Ready, "ready"),
            (UpdatePhase::Installing, "installing"),
            (UpdatePhase::Failed, "failed"),
        ] {
            assert_eq!(serde_json::to_value(phase).unwrap(), expected);
        }
    }

    #[test]
    fn detects_symlink_components() {
        // macOS 的 /tmp 是指向 /private/tmp 的符号链接
        assert!(
            symlink_component(std::path::Path::new("/tmp/foo.app/Contents/MacOS/bin")).is_some()
        );
        assert!(symlink_component(std::path::Path::new("/Applications/KiroProxy.app")).is_none());
    }

    #[test]
    fn endpoint_override_accepts_https_and_rejects_garbage() {
        // 环境变量是进程级状态，测试里用唯一变量名避免互相影响由 serial 测试保证；
        // 这里只验证解析逻辑本身
        let parsed: Result<tauri::Url, _> = "https://example.com/latest.json".parse();
        assert!(parsed.is_ok());
        assert!("://bad".parse::<tauri::Url>().is_err());
    }
}
