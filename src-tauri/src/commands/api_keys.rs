// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::state::{AppState, Core};
use chrono::{DateTime, Utc};
use kiro_core::model::api_key::ApiKey;
use kiro_core::model::usage::{UsageRecordsPage, UsageSummary};
use serde::{Deserialize, Deserializer, Serialize};
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiKeyView {
    pub id: u32,
    pub name: String,
    pub masked_key: String,
    pub enabled: bool,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub spending_limit: Option<f64>,
    pub limit_unit: String,
    pub duration_days: Option<f64>,
    pub activated_at: Option<DateTime<Utc>>,
    pub bound_credential_ids: Option<Vec<u64>>,
    pub used_amount: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateApiKeyRequest {
    pub name: String,
    #[serde(default)]
    pub spending_limit: Option<f64>,
    #[serde(default = "default_limit_unit")]
    pub limit_unit: String,
    #[serde(default)]
    pub duration_days: Option<f64>,
    #[serde(default)]
    pub bound_credential_ids: Option<Vec<u64>>,
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateApiKeyRequest {
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub spending_limit: Option<Option<f64>>,
    #[serde(default)]
    pub limit_unit: Option<String>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub duration_days: Option<Option<f64>>,
    #[serde(default, deserialize_with = "deserialize_double_option")]
    pub bound_credential_ids: Option<Option<Vec<u64>>>,
}

fn default_limit_unit() -> String {
    "usd".to_string()
}

/// 区分「字段缺省」与「显式 null」：缺省表示不修改，null 表示清空。
fn deserialize_double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}

fn mask_key(key: &str) -> String {
    let visible = key.chars().count() / 2;
    let masked: String = key.chars().take(visible).collect();
    format!("{masked}***")
}

fn api_key_view(core: &Core, key: &ApiKey) -> ApiKeyView {
    let used_amount = if key.limit_unit == "credits" {
        core.stores.usage.get_total_credits(key.id)
    } else {
        core.stores.usage.get_total_cost(key.id)
    };
    ApiKeyView {
        id: key.id,
        name: key.name.clone(),
        masked_key: mask_key(&key.key),
        enabled: key.enabled,
        created_at: key.created_at,
        expires_at: key.expires_at,
        spending_limit: key.spending_limit,
        limit_unit: key.limit_unit.clone(),
        duration_days: key.duration_days,
        activated_at: key.activated_at,
        bound_credential_ids: key.bound_credential_ids.clone(),
        used_amount,
    }
}

fn not_found() -> IpcError {
    IpcError::new("not_found", "API Key 不存在")
}

fn credential_labels(core: &Core) -> HashMap<u64, String> {
    core.backend.read().admin.credential_labels()
}

#[tauri::command]
pub fn list_api_keys(state: tauri::State<'_, AppState>) -> Result<Vec<ApiKeyView>, IpcError> {
    let core = state.core()?;
    Ok(core
        .stores
        .api_keys
        .list()
        .iter()
        .map(|key| api_key_view(&core, key))
        .collect())
}

#[tauri::command]
pub fn get_api_key_secret(state: tauri::State<'_, AppState>, id: u32) -> Result<String, IpcError> {
    let core = state.core()?;
    core.stores
        .api_keys
        .list()
        .into_iter()
        .find(|key| key.id == id)
        .map(|key| key.key)
        .ok_or_else(not_found)
}

#[tauri::command]
pub fn create_api_key(
    state: tauri::State<'_, AppState>,
    req: CreateApiKeyRequest,
) -> Result<ApiKeyView, IpcError> {
    let core = state.core()?;
    let key = core.stores.api_keys.create(
        req.name,
        None,
        req.spending_limit,
        Some(req.limit_unit),
        req.duration_days,
        req.bound_credential_ids,
    )?;
    Ok(api_key_view(&core, &key))
}

#[tauri::command]
pub fn update_api_key(
    state: tauri::State<'_, AppState>,
    id: u32,
    req: UpdateApiKeyRequest,
) -> Result<ApiKeyView, IpcError> {
    let core = state.core()?;
    let updated = core.stores.api_keys.update(
        id,
        req.name,
        req.enabled,
        None,
        req.spending_limit,
        req.limit_unit,
        req.duration_days,
        req.bound_credential_ids,
    )?;
    updated
        .map(|key| api_key_view(&core, &key))
        .ok_or_else(not_found)
}

#[tauri::command]
pub fn delete_api_key(state: tauri::State<'_, AppState>, id: u32) -> Result<(), IpcError> {
    let core = state.core()?;
    if core.stores.api_keys.delete(id)? {
        Ok(())
    } else {
        Err(not_found())
    }
}

#[tauri::command]
pub fn get_all_api_key_usage(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<UsageSummary>, IpcError> {
    let core = state.core()?;
    Ok(core.stores.usage.get_all_summaries())
}

#[tauri::command]
pub fn get_api_key_usage(
    state: tauri::State<'_, AppState>,
    id: u32,
) -> Result<UsageSummary, IpcError> {
    let core = state.core()?;
    Ok(core.stores.usage.get_summary(id))
}

#[tauri::command]
pub fn get_api_key_usage_records(
    state: tauri::State<'_, AppState>,
    id: u32,
    page: usize,
    page_size: usize,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    let labels = credential_labels(&core);
    Ok(core
        .stores
        .usage
        .get_records_paged(id, page.max(1), page_size.max(1), &labels))
}

#[tauri::command]
pub fn reset_api_key_usage(state: tauri::State<'_, AppState>, id: u32) -> Result<(), IpcError> {
    let core = state.core()?;
    core.stores.usage.reset(id)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mask_key_keeps_first_half_only() {
        assert_eq!(mask_key("sk-1234567890"), "sk-123***");
        assert_eq!(mask_key("ab"), "a***");
        assert_eq!(mask_key("周周周周"), "周周***");
        assert_eq!(mask_key(""), "***");
    }

    #[test]
    fn update_request_distinguishes_missing_from_explicit_null() {
        let missing: UpdateApiKeyRequest = serde_json::from_str("{}").unwrap();
        assert!(missing.spending_limit.is_none());
        assert!(missing.duration_days.is_none());
        assert!(missing.bound_credential_ids.is_none());

        let cleared: UpdateApiKeyRequest = serde_json::from_str(
            r#"{"spendingLimit":null,"durationDays":null,"boundCredentialIds":null}"#,
        )
        .unwrap();
        assert_eq!(cleared.spending_limit, Some(None));
        assert_eq!(cleared.duration_days, Some(None));
        assert_eq!(cleared.bound_credential_ids, Some(None));

        let set: UpdateApiKeyRequest = serde_json::from_str(
            r#"{"spendingLimit":12.5,"durationDays":30,"boundCredentialIds":[1,2]}"#,
        )
        .unwrap();
        assert_eq!(set.spending_limit, Some(Some(12.5)));
        assert_eq!(set.duration_days, Some(Some(30.0)));
        assert_eq!(set.bound_credential_ids, Some(Some(vec![1, 2])));
    }
}
