// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::state::AppState;
use kiro_core::admin::types::AddCredentialRequest;
use kiro_core::kam::{self, refresh_token_hash};
use serde::Serialize;
use std::collections::HashSet;
use tauri::{AppHandle, Emitter};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KamPreview {
    pub accounts: Vec<KamPreviewAccount>,
    pub duplicates_in_file: usize,
    pub invalid: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KamPreviewAccount {
    pub email: Option<String>,
    pub nickname: Option<String>,
    pub provider: Option<String>,
    pub auth_method: Option<String>,
    pub auth_region: Option<String>,
    pub has_client_id: bool,
    pub has_client_secret: bool,
    pub masked_token: String,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ImportOutcome {
    pub imported: u32,
    pub duplicate: u32,
    pub invalid: u32,
    pub failed: u32,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VerifyItem {
    pub id: u64,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct VerifyOutcome {
    pub success: u32,
    pub failed: u32,
    pub results: Vec<VerifyItem>,
}

pub fn preview_kam(json: &str) -> anyhow::Result<KamPreview> {
    let parsed = kam::parse(json)?;
    Ok(KamPreview {
        duplicates_in_file: parsed.duplicates_in_file,
        invalid: parsed.invalid,
        accounts: parsed
            .accounts
            .into_iter()
            .map(|a| KamPreviewAccount {
                email: a.email,
                nickname: a.nickname,
                provider: a.provider,
                auth_method: a.auth_method,
                auth_region: a.auth_region,
                has_client_id: a.client_id.is_some(),
                has_client_secret: a.client_secret.is_some(),
                masked_token: format!(
                    "{}***",
                    &a.refresh_token.chars().take(8).collect::<String>()
                ),
            })
            .collect(),
    })
}

pub async fn import_kam(
    state: &AppState,
    json: &str,
    verify: bool,
    app: &AppHandle,
) -> Result<ImportOutcome, IpcError> {
    let core = state.core()?;
    let parsed = kam::parse(json)?;
    let existing: HashSet<String> = core
        .backend
        .read()
        .admin
        .get_all_credentials()
        .credentials
        .iter()
        .filter_map(|c| c.refresh_token_hash.clone())
        .collect();

    let mut outcome = ImportOutcome {
        duplicate: parsed.duplicates_in_file as u32,
        invalid: parsed.invalid as u32,
        ..Default::default()
    };

    for (index, account) in parsed.accounts.iter().enumerate() {
        if existing.contains(&refresh_token_hash(&account.refresh_token)) {
            outcome.duplicate += 1;
            continue;
        }
        let req = AddCredentialRequest {
            refresh_token: account.refresh_token.clone(),
            auth_method: account
                .auth_method
                .clone()
                .unwrap_or_else(|| "social".into()),
            client_id: account.client_id.clone(),
            client_secret: account.client_secret.clone(),
            provider: account.provider.clone(),
            profile_arn: account.profile_arn.clone(),
            auth_region: account.auth_region.clone(),
            disabled: true,
            ..Default::default()
        };
        let admin = core.backend.read().admin.clone();
        let created = admin
            .add_credential(req)
            .await
            .map_err(IpcError::internal)?;
        let id = created.credential_id;
        let mut ok = true;
        if verify {
            if admin.get_balance(id).await.is_ok() {
                admin
                    .set_disabled(id, false)
                    .await
                    .map_err(IpcError::internal)?;
            } else {
                outcome.failed += 1;
                ok = false;
            }
        }
        outcome.imported += 1;
        let status = if ok { "success" } else { "failed" };
        let _ = app.emit(
            "accounts://import-progress",
            serde_json::json!({
                "current": index + 1,
                "total": parsed.accounts.len(),
                "id": id,
                "status": status
            }),
        );
    }
    Ok(outcome)
}

pub async fn verify_accounts(
    state: &AppState,
    ids: Vec<u64>,
    app: &AppHandle,
) -> Result<VerifyOutcome, IpcError> {
    let core = state.core()?;
    let admin = core.backend.read().admin.clone();
    let mut outcome = VerifyOutcome::default();
    state
        .verify_cancel
        .store(false, std::sync::atomic::Ordering::Relaxed);

    for (index, id) in ids.iter().enumerate() {
        if state
            .verify_cancel
            .load(std::sync::atomic::Ordering::Relaxed)
        {
            break;
        }
        match admin.get_balance(*id).await {
            Ok(balance) => {
                outcome.success += 1;
                outcome.results.push(VerifyItem {
                    id: *id,
                    status: "success".into(),
                    message: Some(format!("{}/{}", balance.current_usage, balance.usage_limit)),
                });
            }
            Err(e) => {
                outcome.failed += 1;
                outcome.results.push(VerifyItem {
                    id: *id,
                    status: "failed".into(),
                    message: Some(e.to_string()),
                });
            }
        }
        let last = outcome.results.last().unwrap();
        let _ = app.emit(
            "accounts://verify-progress",
            serde_json::json!({
                "current": index + 1,
                "total": ids.len(),
                "id": id,
                "status": last.status.clone(),
                "message": last.message.clone()
            }),
        );
        if index + 1 < ids.len() {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        }
    }
    Ok(outcome)
}
