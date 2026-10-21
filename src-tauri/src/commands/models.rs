// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::state::AppState;
use kiro_core::admin::types::AdminModelItem;

#[tauri::command]
pub async fn list_models(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<AdminModelItem>, IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    Ok(admin.list_admin_models().await)
}

#[tauri::command]
pub async fn get_account_models(
    state: tauri::State<'_, AppState>,
    id: u64,
) -> Result<Vec<AdminModelItem>, IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    let response = admin
        .list_admin_models_for(id)
        .await
        .map_err(IpcError::internal)?;
    Ok(response.data)
}
