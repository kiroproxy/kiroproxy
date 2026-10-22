// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::error::IpcError;
use crate::services::updater::{self, UpdateStatus};

#[tauri::command]
pub fn get_update_status(app: tauri::AppHandle) -> UpdateStatus {
    updater::status(&app)
}

/// 检查更新；发现新版本会自动在后台下载（完成后再等用户确认安装）
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateStatus, IpcError> {
    updater::check(app).await
}

/// 安装已下载的更新并重启；只在用户确认后调用
#[tauri::command]
pub async fn install_update(app: tauri::AppHandle) -> Result<(), IpcError> {
    updater::install(app).await
}

/// 打开 GitHub 发布页（无法自动更新时的手动下载入口）
#[tauri::command]
pub fn open_update_page(app: tauri::AppHandle) -> Result<(), IpcError> {
    updater::open_releases_page(&app)
}
