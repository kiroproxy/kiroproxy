// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::error::IpcError;
use crate::state::{AppState, Core};
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

/// KAM 账号映射为添加请求。
///
/// `verify = true` 时先以禁用状态创建，余额校验通过后再启用（校验失败的账号保持禁用）；
/// `verify = false` 时直接以启用状态创建——此前一律 `disabled: true` 且之后无人启用，
/// 账号被计入「已导入」却永远不可用。
pub(crate) fn kam_add_request(account: &kam::KamAccount, verify: bool) -> AddCredentialRequest {
    AddCredentialRequest {
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
        disabled: verify,
        ..Default::default()
    }
}

pub async fn import_kam(
    core: &Core,
    json: &str,
    verify: bool,
    mut on_progress: impl FnMut(serde_json::Value),
) -> Result<ImportOutcome, IpcError> {
    let parsed = kam::parse(json)?;
    let admin = core.admin();
    let existing: HashSet<String> = admin
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
        let created = admin
            .add_credential(kam_add_request(account, verify))
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
        on_progress(serde_json::json!({
            "current": index + 1,
            "total": parsed.accounts.len(),
            "id": id,
            "status": status
        }));
    }
    Ok(outcome)
}

pub async fn verify_accounts(
    state: &AppState,
    ids: Vec<u64>,
    app: &AppHandle,
) -> Result<VerifyOutcome, IpcError> {
    let core = state.core()?;
    let admin = core.admin();
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

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_account() -> kam::KamAccount {
        kam::KamAccount {
            refresh_token: "r".repeat(150),
            email: Some("user@example.com".into()),
            nickname: Some("工作号".into()),
            auth_method: Some("social".into()),
            ..Default::default()
        }
    }

    #[test]
    fn kam_import_without_verify_creates_enabled_accounts() {
        let req = kam_add_request(&sample_account(), false);
        assert!(!req.disabled, "不验证时账号应直接可用");
        assert_eq!(req.auth_method, "social");
        assert_eq!(req.refresh_token, "r".repeat(150));
    }

    #[test]
    fn kam_import_with_verify_creates_disabled_until_balance_check() {
        let req = kam_add_request(&sample_account(), true);
        assert!(req.disabled, "验证模式先禁用，余额校验通过后再启用");
    }

    #[test]
    fn kam_request_defaults_auth_method_to_social() {
        let mut account = sample_account();
        account.auth_method = None;
        assert_eq!(kam_add_request(&account, false).auth_method, "social");
    }
}
