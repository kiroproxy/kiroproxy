// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::state::{AppState, Core};
use kiro_core::paths::AppPaths;
use kiro_core::runtime::{Backend, ServerStatus};
use serde::Serialize;
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

#[tauri::command]
pub fn get_server_status(state: tauri::State<'_, AppState>) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    let mut status = core.backend.read().status();
    status.last_error = core.server_error.read().clone();
    Ok(status)
}

#[tauri::command]
pub async fn start_proxy_server(
    state: tauri::State<'_, AppState>,
) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    let config = core.config.read().clone();
    let mut backend = core.backend.write();
    if !backend.status().running {
        backend.start_server(&config)?;
    }
    *core.server_error.write() = None;
    Ok(backend.status())
}

#[tauri::command]
pub async fn stop_proxy_server(
    state: tauri::State<'_, AppState>,
) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    // parking_lot 守卫不可跨 await，停止等待放到阻塞线程池执行。
    tauri::async_runtime::spawn_blocking(move || {
        let mut backend = core.backend.write();
        tauri::async_runtime::block_on(backend.stop_server());
        Ok::<_, IpcError>(backend.status())
    })
    .await
    .map_err(IpcError::internal)?
}

fn restart_blocking(core: &Core, paths: &AppPaths) -> Result<ServerStatus, IpcError> {
    let config = core.config.read().clone();
    let mut next = Backend::build(paths, &config, &core.stores, core.log_capture.clone())?;
    next.generation = core.backend.read().generation + 1;
    let mut old = core.backend.write();
    tauri::async_runtime::block_on(old.stop_server());
    match next.start_server(&config) {
        Ok(()) => {
            *core.server_error.write() = None;
            *old = next;
        }
        Err(e) => {
            let msg = e.to_string();
            let _ = old.start_server(&config);
            *core.server_error.write() = Some(msg.clone());
            return Err(IpcError::new("server_bind_failed", msg));
        }
    }
    Ok(old.status())
}

#[tauri::command]
pub async fn restart_proxy_server(
    state: tauri::State<'_, AppState>,
) -> Result<ServerStatus, IpcError> {
    let core = state.core()?;
    let paths = state.paths.clone();
    tauri::async_runtime::spawn_blocking(move || restart_blocking(&core, &paths))
        .await
        .map_err(IpcError::internal)?
}

#[tauri::command]
pub fn retry_startup(state: tauri::State<'_, AppState>) -> Result<ServerStatus, IpcError> {
    state.retry()?;
    let core = state.core()?;
    let mut status = core.backend.read().status();
    status.last_error = core.server_error.read().clone();
    Ok(status)
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
    let core = state.core()?;
    let path = match kind.as_str() {
        "config" => core.config_store.path().to_path_buf(),
        "credentials" => state.paths.credentials(),
        "log" => state.paths.log_file(),
        _ => return Err(IpcError::new("invalid_request", "未知文件类型")),
    };
    app.opener()
        .open_path(path.to_string_lossy().to_string(), None::<&str>)
        .map_err(IpcError::internal)
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, IpcError> {
    let meta = std::fs::metadata(&path)?;
    if meta.len() > 5 * 1024 * 1024 {
        return Err(IpcError::new("invalid_request", "文件超过 5MB"));
    }
    Ok(std::fs::read_to_string(path)?)
}

#[tauri::command]
pub fn clear_logs(state: tauri::State<'_, AppState>) -> Result<(), IpcError> {
    let core = state.core()?;
    core.log_capture.clear();
    let file = std::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(state.paths.log_file())?;
    drop(file);
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}
