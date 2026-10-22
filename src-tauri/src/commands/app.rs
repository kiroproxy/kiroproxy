// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::commands::blocking;
use crate::error::IpcError;
use crate::services::server;
use crate::state::AppState;
use kiro_core::runtime::ServerStatus;
use serde::Serialize;
use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    pub version: String,
    pub data_dir: String,
    pub config_path: String,
    pub credentials_path: String,
    pub platform: String,
}

#[tauri::command]
pub fn get_app_info(state: tauri::State<'_, AppState>) -> Result<AppInfo, IpcError> {
    Ok(AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        data_dir: state.paths.root().to_string_lossy().to_string(),
        config_path: state.paths.config().to_string_lossy().to_string(),
        credentials_path: state.paths.credentials().to_string_lossy().to_string(),
        platform: std::env::consts::OS.to_string(),
    })
}

#[tauri::command]
pub fn get_startup_error(state: tauri::State<'_, AppState>) -> Option<IpcError> {
    state.startup_error.read().clone()
}

/// 同步命令（主线程）：只取瞬时读锁，生命周期操作不会持有 backend 写锁等待关闭
#[tauri::command]
pub fn get_server_status(state: tauri::State<'_, AppState>) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    Ok(server::status(&core))
}

#[tauri::command]
pub async fn start_proxy_server(
    state: tauri::State<'_, AppState>,
) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    server::start(&core).await
}

#[tauri::command]
pub async fn stop_proxy_server(
    state: tauri::State<'_, AppState>,
) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    server::stop(&core).await
}

#[tauri::command]
pub async fn restart_proxy_server(
    state: tauri::State<'_, AppState>,
) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    server::restart(core).await
}

/// 重试启动：构建运行时涉及磁盘 IO，放到阻塞线程池
#[tauri::command]
pub async fn retry_startup(app: tauri::AppHandle) -> Result<ServerStatus, IpcError> {
    blocking(move || {
        let state = app.state::<AppState>();
        state.retry()?;
        let core = state.core()?;
        Ok(server::status(&core))
    })
    .await
}

#[tauri::command]
pub fn open_data_dir(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<(), IpcError> {
    app.opener()
        .open_path(
            state.paths.root().to_string_lossy().to_string(),
            None::<&str>,
        )
        .map_err(IpcError::internal)
}

#[tauri::command]
pub fn open_file(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    kind: String,
) -> Result<(), IpcError> {
    let path = match kind.as_str() {
        "config" => state.paths.config(),
        "credentials" => state.paths.credentials(),
        "log" => state.paths.log_file(),
        _ => return Err(IpcError::new("invalid_request", "未知文件类型")),
    };
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(IpcError::internal)
}

#[tauri::command]
pub async fn clear_logs(state: tauri::State<'_, AppState>) -> Result<(), IpcError> {
    let core = state.core()?;
    blocking(move || {
        core.log_capture.clear();
        kiro_core::app_logging::truncate_log_file(&core.paths.log_file())?;
        Ok(())
    })
    .await
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    // 退出清理（停止服务、落盘）统一在 RunEvent::Exit 中执行
    app.exit(0);
}
