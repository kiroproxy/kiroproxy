// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::commands::blocking;
use crate::error::IpcError;
use crate::services::accounts::{self, ImportOutcome, KamPreview, VerifyOutcome};
use crate::state::AppState;

#[tauri::command]
pub fn list_accounts(
    state: tauri::State<'_, AppState>,
) -> Result<kiro_core::admin::types::CredentialsStatusResponse, IpcError> {
    Ok(state.core()?.admin().get_all_credentials())
}

#[tauri::command]
pub async fn add_account(
    state: tauri::State<'_, AppState>,
    req: kiro_core::admin::types::AddCredentialRequest,
) -> Result<kiro_core::admin::types::AddCredentialResponse, IpcError> {
    let admin = state.core()?.admin();
    admin.add_credential(req).await.map_err(IpcError::internal)
}

#[tauri::command]
pub async fn update_account(
    state: tauri::State<'_, AppState>,
    id: u64,
    req: kiro_core::admin::types::UpdateCredentialRequest,
) -> Result<(), IpcError> {
    let admin = state.core()?.admin();
    admin
        .update_credential(id, req)
        .await
        .map_err(IpcError::internal)
}

#[tauri::command]
pub async fn delete_account(state: tauri::State<'_, AppState>, id: u64) -> Result<(), IpcError> {
    let admin = state.core()?.admin();
    admin
        .delete_credential(id)
        .await
        .map_err(IpcError::internal)
}

#[tauri::command]
pub async fn set_account_disabled(
    state: tauri::State<'_, AppState>,
    id: u64,
    disabled: bool,
) -> Result<(), IpcError> {
    let admin = state.core()?.admin();
    admin
        .set_disabled(id, disabled)
        .await
        .map_err(IpcError::internal)
}

/// 修改优先级会同步回写 credentials.json（fsync），放到阻塞线程池
#[tauri::command]
pub async fn set_account_priority(
    state: tauri::State<'_, AppState>,
    id: u64,
    priority: u32,
) -> Result<(), IpcError> {
    let admin = state.core()?.admin();
    blocking(move || admin.set_priority(id, priority).map_err(IpcError::internal)).await
}

#[tauri::command]
pub async fn reset_account_failure(
    state: tauri::State<'_, AppState>,
    id: u64,
) -> Result<(), IpcError> {
    let admin = state.core()?.admin();
    admin.reset_and_enable(id).await.map_err(IpcError::internal)
}

/// 查询余额；`force = true` 跳过 5 分钟缓存直接查询上游（成功后刷新缓存）
#[tauri::command]
pub async fn get_account_balance(
    state: tauri::State<'_, AppState>,
    id: u64,
    force: Option<bool>,
) -> Result<kiro_core::admin::types::BalanceResponse, IpcError> {
    let admin = state.core()?.admin();
    admin
        .get_balance_with(id, force == Some(true))
        .await
        .map_err(IpcError::internal)
}

#[tauri::command]
pub fn preview_kam_import(json: String) -> Result<KamPreview, IpcError> {
    accounts::preview_kam(&json).map_err(IpcError::internal)
}

#[tauri::command]
pub async fn import_kam_accounts(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    json: String,
    verify: bool,
) -> Result<ImportOutcome, IpcError> {
    let core = state.core()?;
    accounts::import_kam(&core, &json, verify, |progress| {
        use tauri::Emitter;
        let _ = app.emit("accounts://import-progress", progress);
    })
    .await
}

#[tauri::command]
pub async fn verify_accounts(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    ids: Vec<u64>,
) -> Result<VerifyOutcome, IpcError> {
    accounts::verify_accounts(state.inner(), ids, &app).await
}

#[tauri::command]
pub fn cancel_verify_accounts(state: tauri::State<'_, AppState>) {
    state
        .verify_cancel
        .store(true, std::sync::atomic::Ordering::Relaxed);
}
