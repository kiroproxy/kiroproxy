// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::services::accounts::{self, ImportOutcome, KamPreview, VerifyOutcome};
use crate::state::AppState;

#[tauri::command]
pub fn list_accounts(
    state: tauri::State<'_, AppState>,
) -> Result<kiro_core::admin::types::CredentialsStatusResponse, IpcError> {
    let core = state.core()?;
    Ok(core.backend.read().admin.get_all_credentials())
}

#[tauri::command]
pub async fn add_account(
    state: tauri::State<'_, AppState>,
    req: kiro_core::admin::types::AddCredentialRequest,
) -> Result<kiro_core::admin::types::AddCredentialResponse, IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    admin.add_credential(req).await.map_err(IpcError::internal)
}

#[tauri::command]
pub async fn update_account(
    state: tauri::State<'_, AppState>,
    id: u64,
    req: kiro_core::admin::types::UpdateCredentialRequest,
) -> Result<(), IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    admin
        .update_credential(id, req)
        .await
        .map_err(IpcError::internal)
}

#[tauri::command]
pub async fn delete_account(state: tauri::State<'_, AppState>, id: u64) -> Result<(), IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
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
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    admin
        .set_disabled(id, disabled)
        .await
        .map_err(IpcError::internal)
}

#[tauri::command]
pub fn set_account_priority(
    state: tauri::State<'_, AppState>,
    id: u64,
    priority: u32,
) -> Result<(), IpcError> {
    let core = state.core()?;
    core.backend
        .read()
        .admin
        .set_priority(id, priority)
        .map_err(IpcError::internal)
}

#[tauri::command]
pub async fn reset_account_failure(
    state: tauri::State<'_, AppState>,
    id: u64,
) -> Result<(), IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    admin.reset_and_enable(id).await.map_err(IpcError::internal)
}

#[tauri::command]
pub async fn get_account_balance(
    state: tauri::State<'_, AppState>,
    id: u64,
) -> Result<kiro_core::admin::types::BalanceResponse, IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    admin.get_balance(id).await.map_err(IpcError::internal)
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
    accounts::import_kam(state.inner(), &json, verify, &app).await
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
