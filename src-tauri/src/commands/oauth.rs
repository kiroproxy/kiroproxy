// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::error::IpcError;
use crate::services::oauth::{self, OauthStatus};

/// 当前登录状态（重新打开添加账号弹窗时恢复界面）
#[tauri::command]
pub fn get_oauth_status(app: tauri::AppHandle) -> OauthStatus {
    oauth::status(&app)
}

/// 发起浏览器登录：provider 为 "google" 或 "github"
#[tauri::command]
pub async fn start_browser_login(
    app: tauri::AppHandle,
    provider: String,
) -> Result<OauthStatus, IpcError> {
    oauth::start(app, provider).await
}

#[tauri::command]
pub fn cancel_browser_login(app: tauri::AppHandle) -> OauthStatus {
    oauth::cancel(&app)
}

/// 重新打开当前登录的授权页（没有进行中的登录时返回 not_found）
#[tauri::command]
pub fn reopen_login_page(app: tauri::AppHandle) -> Result<(), IpcError> {
    oauth::reopen(&app)
}
