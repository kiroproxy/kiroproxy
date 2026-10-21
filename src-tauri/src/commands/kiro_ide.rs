// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::services::accounts::ImportOutcome;
use crate::state::AppState;
use kiro_core::admin::types::AddCredentialRequest;
use kiro_core::kam::refresh_token_hash;
use kiro_core::kiro_ide;
use serde::Serialize;
use std::collections::HashSet;
use tauri::Emitter;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KiroIdePreview {
    pub masked_refresh_token: String,
    pub provider: Option<String>,
    pub auth_method: Option<String>,
    pub profile_arn: Option<String>,
    pub expires_at: Option<String>,
    pub path: String,
}

#[tauri::command]
pub fn scan_kiro_ide() -> Result<Option<KiroIdePreview>, IpcError> {
    let account = kiro_ide::scan().map_err(IpcError::internal)?;
    Ok(account.map(|account| KiroIdePreview {
        masked_refresh_token: kiro_ide::mask_token(&account.refresh_token),
        provider: account.provider,
        auth_method: account.auth_method,
        profile_arn: account.profile_arn,
        expires_at: account.expires_at,
        path: account.path.to_string_lossy().to_string(),
    }))
}

#[tauri::command]
pub async fn import_kiro_ide(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> Result<ImportOutcome, IpcError> {
    let core = state.core()?;
    let Some(account) = kiro_ide::scan().map_err(IpcError::internal)? else {
        return Err(IpcError::new(
            "not_found",
            "未找到 Kiro IDE 登录信息，请先在本机登录 Kiro IDE",
        ));
    };

    let existing: HashSet<String> = core
        .backend
        .read()
        .admin
        .get_all_credentials()
        .credentials
        .iter()
        .filter_map(|item| item.refresh_token_hash.clone())
        .collect();
    if existing.contains(&refresh_token_hash(&account.refresh_token)) {
        return Ok(ImportOutcome {
            imported: 0,
            duplicate: 1,
            invalid: 0,
            failed: 0,
        });
    }

    let req = AddCredentialRequest {
        refresh_token: account.refresh_token,
        auth_method: account.auth_method.unwrap_or_else(|| "social".to_string()),
        client_id: account.client_id,
        client_secret: account.client_secret,
        provider: account.provider,
        profile_arn: account.profile_arn,
        nickname: Some("Kiro IDE".to_string()),
        disabled: true,
        ..Default::default()
    };
    let admin = core.backend.read().admin.clone();
    let created = admin
        .add_credential(req)
        .await
        .map_err(IpcError::internal)?;
    let id = created.credential_id;
    let ok = admin.get_balance(id).await.is_ok();
    if ok {
        admin
            .set_disabled(id, false)
            .await
            .map_err(IpcError::internal)?;
    }
    let _ = app.emit(
        "accounts://verify-progress",
        serde_json::json!({
            "current": 1,
            "total": 1,
            "id": id,
            "status": if ok { "success" } else { "failed" },
        }),
    );

    Ok(ImportOutcome {
        imported: 1,
        duplicate: 0,
        invalid: 0,
        failed: if ok { 0 } else { 1 },
    })
}
