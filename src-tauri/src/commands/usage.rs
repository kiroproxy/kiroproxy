// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 用量命令：遍历全部用量记录（最多数万条）的查询都放到阻塞线程池，避免占用主线程。

use crate::commands::blocking;
use crate::error::IpcError;
use crate::state::{AppState, Core};
use kiro_core::model::rpm::RpmSnapshot;
use kiro_core::model::usage::{
    CredentialDaySummary, DailySummary, UsageBreakdown, UsageRecordFilter, UsageRecordsPage,
};
use serde::Deserialize;
use std::collections::HashMap;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageFilter {
    pub from: String,
    pub to: String,
    #[serde(default)]
    pub api_key_id: Option<u32>,
    #[serde(default)]
    pub credential_id: Option<u64>,
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default = "default_page")]
    pub page: usize,
    #[serde(default = "default_page_size")]
    pub page_size: usize,
}

fn default_page() -> usize {
    1
}

fn default_page_size() -> usize {
    50
}

fn credential_labels(core: &Core) -> HashMap<u64, String> {
    core.admin().credential_labels()
}

/// 校验 `YYYY-MM-DD` 日期（区间按 CST 日期字符串比较，格式不对会得到错误的结果）
fn validate_date(value: &str, field: &str) -> Result<(), IpcError> {
    chrono::NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| {
            IpcError::new(
                "invalid_request",
                format!("{field} 应为 YYYY-MM-DD 格式的日期"),
            )
        })
}

#[tauri::command]
pub async fn get_daily_usage(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DailySummary>, IpcError> {
    let core = state.core()?;
    blocking(move || Ok(core.stores.usage.get_daily_summaries())).await
}

#[tauri::command]
pub async fn get_daily_usage_records(
    state: tauri::State<'_, AppState>,
    date: String,
    page: usize,
    page_size: usize,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    blocking(move || {
        let labels = credential_labels(&core);
        Ok(core.stores.usage.get_records_paged_by_date(
            &date,
            page.max(1),
            page_size.max(1),
            &labels,
        ))
    })
    .await
}

/// 构造用量查询：与历史行为一致，api_key_id 优先于 credential_id，二者都没有时按日期区间
pub(crate) fn query_records(core: &Core, filter: &UsageFilter) -> UsageRecordsPage {
    let labels = credential_labels(core);
    let page = filter.page.max(1);
    let page_size = filter.page_size.max(1);
    let model = filter.model.as_deref().filter(|m| !m.is_empty());
    let query = if let Some(api_key_id) = filter.api_key_id {
        UsageRecordFilter {
            api_key_id: Some(api_key_id),
            model,
            ..Default::default()
        }
    } else if let Some(credential_id) = filter.credential_id {
        UsageRecordFilter {
            credential_id: Some(credential_id),
            model,
            ..Default::default()
        }
    } else {
        UsageRecordFilter {
            model,
            date_range: Some((filter.from.as_str(), filter.to.as_str())),
            ..Default::default()
        }
    };
    // 一次遍历完成全部过滤（此前带 model 时要逐页取回全部记录再过滤）
    core.stores
        .usage
        .get_records_paged_filtered(&query, page, page_size, &labels)
}

#[tauri::command]
pub async fn get_usage_records(
    state: tauri::State<'_, AppState>,
    filter: UsageFilter,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    if filter.api_key_id.is_none() && filter.credential_id.is_none() {
        validate_date(&filter.from, "from")?;
        validate_date(&filter.to, "to")?;
    }
    blocking(move || Ok(query_records(&core, &filter))).await
}

/// 区间（含两端，CST 日期）内按模型与按日期×模型的用量分布
#[tauri::command]
pub async fn get_usage_breakdown(
    state: tauri::State<'_, AppState>,
    from: String,
    to: String,
) -> Result<UsageBreakdown, IpcError> {
    validate_date(&from, "from")?;
    validate_date(&to, "to")?;
    let core = state.core()?;
    blocking(move || Ok(core.stores.usage.get_usage_breakdown(&from, &to))).await
}

#[tauri::command]
pub async fn get_credential_usage_records(
    state: tauri::State<'_, AppState>,
    credential_id: u64,
    page: usize,
    page_size: usize,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    blocking(move || {
        let labels = credential_labels(&core);
        Ok(core.stores.usage.get_records_paged_by_credential(
            credential_id,
            page.max(1),
            page_size.max(1),
            &labels,
        ))
    })
    .await
}

#[tauri::command]
pub async fn get_credential_today_summary(
    state: tauri::State<'_, AppState>,
    credential_id: u64,
) -> Result<CredentialDaySummary, IpcError> {
    let core = state.core()?;
    blocking(move || {
        Ok(core
            .stores
            .usage
            .get_today_summary_for_credential(credential_id))
    })
    .await
}

#[tauri::command]
pub fn get_rpm(state: tauri::State<'_, AppState>) -> Result<RpmSnapshot, IpcError> {
    let core = state.core()?;
    Ok(core.stores.rpm.snapshot())
}

#[cfg(test)]
mod tests {
    use super::*;
    use kiro_core::model::usage::RecordOptions;

    #[tokio::test(flavor = "multi_thread")]
    async fn query_records_filters_model_in_single_pass() {
        let (_dir, state) = crate::state::test_support::test_state();
        let core = state.core().unwrap();
        for _ in 0..3 {
            core.stores
                .usage
                .record(1, "claude-opus-4.6".into(), 1, 1, RecordOptions::default());
            core.stores.usage.record(
                1,
                "claude-sonnet-4.5".into(),
                1,
                1,
                RecordOptions::default(),
            );
        }
        let today = chrono::Utc::now()
            .with_timezone(&chrono::FixedOffset::east_opt(8 * 3600).unwrap())
            .format("%Y-%m-%d")
            .to_string();
        let filter = UsageFilter {
            from: today.clone(),
            to: today,
            api_key_id: None,
            credential_id: None,
            model: Some("claude-opus-4.6".into()),
            page: 1,
            page_size: 2,
        };
        let page = query_records(&core, &filter);
        assert_eq!(page.total, 3);
        assert_eq!(page.total_pages, 2);
        assert!(page.records.iter().all(|r| r.model == "claude-opus-4.6"));

        let by_key = UsageFilter {
            api_key_id: Some(1),
            model: None,
            ..filter
        };
        assert_eq!(query_records(&core, &by_key).total, 6);
    }

    #[test]
    fn validate_date_rejects_bad_format() {
        assert!(validate_date("2026-10-01", "from").is_ok());
        assert_eq!(
            validate_date("2026/10/01", "from").unwrap_err().code,
            "invalid_request"
        );
        assert!(validate_date("", "to").is_err());
    }
}
