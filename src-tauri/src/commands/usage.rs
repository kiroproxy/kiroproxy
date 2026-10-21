// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::state::{AppState, Core};
use kiro_core::model::rpm::RpmSnapshot;
use kiro_core::model::usage::{CredentialDaySummary, DailySummary, UsageRecordsPage};
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
    core.backend.read().admin.credential_labels()
}

#[tauri::command]
pub fn get_daily_usage(state: tauri::State<'_, AppState>) -> Result<Vec<DailySummary>, IpcError> {
    let core = state.core()?;
    Ok(core.stores.usage.get_daily_summaries())
}

#[tauri::command]
pub fn get_daily_usage_records(
    state: tauri::State<'_, AppState>,
    date: String,
    page: usize,
    page_size: usize,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    let labels = credential_labels(&core);
    Ok(core
        .stores
        .usage
        .get_records_paged_by_date(&date, page.max(1), page_size.max(1), &labels))
}

#[tauri::command]
pub fn get_usage_records(
    state: tauri::State<'_, AppState>,
    filter: UsageFilter,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    let labels = credential_labels(&core);
    let UsageFilter {
        from,
        to,
        api_key_id,
        credential_id,
        model,
        page,
        page_size,
    } = filter;
    let page = page.max(1);
    let page_size = page_size.max(1);
    let fetch = |p: usize, size: usize| -> UsageRecordsPage {
        if let Some(api_key_id) = api_key_id {
            core.stores
                .usage
                .get_records_paged(api_key_id, p, size, &labels)
        } else if let Some(credential_id) = credential_id {
            core.stores
                .usage
                .get_records_paged_by_credential(credential_id, p, size, &labels)
        } else {
            core.stores
                .usage
                .get_records_paged_by_date_range(&from, &to, p, size, &labels)
        }
    };
    // UsageTracker 没有按模型过滤的分页接口：指定 model 时先取回全部页，
    // 过滤后再本地分页，保证 total/totalPages 与过滤结果一致。
    let records = match model.as_deref() {
        Some(model) => {
            let mut all = Vec::new();
            let mut current = 1;
            loop {
                let chunk = fetch(current, 500);
                let total_pages = chunk.total_pages;
                all.extend(chunk.records);
                if current >= total_pages {
                    break;
                }
                current += 1;
            }
            let mut filtered: Vec<_> = all
                .into_iter()
                .filter(|record| record.model == model)
                .collect();
            let total = filtered.len();
            let total_pages = total.div_ceil(page_size);
            let page = page.min(total_pages.max(1));
            let start = (page - 1) * page_size;
            let records = filtered.drain(..).skip(start).take(page_size).collect();
            UsageRecordsPage {
                records,
                total,
                page,
                page_size,
                total_pages,
            }
        }
        None => fetch(page, page_size),
    };
    Ok(records)
}

#[tauri::command]
pub fn get_credential_usage_records(
    state: tauri::State<'_, AppState>,
    credential_id: u64,
    page: usize,
    page_size: usize,
) -> Result<UsageRecordsPage, IpcError> {
    let core = state.core()?;
    let labels = credential_labels(&core);
    Ok(core.stores.usage.get_records_paged_by_credential(
        credential_id,
        page.max(1),
        page_size.max(1),
        &labels,
    ))
}

#[tauri::command]
pub fn get_credential_today_summary(
    state: tauri::State<'_, AppState>,
    credential_id: u64,
) -> Result<CredentialDaySummary, IpcError> {
    let core = state.core()?;
    Ok(core
        .stores
        .usage
        .get_today_summary_for_credential(credential_id))
}

#[tauri::command]
pub fn get_rpm(state: tauri::State<'_, AppState>) -> Result<RpmSnapshot, IpcError> {
    let core = state.core()?;
    Ok(core.stores.rpm.snapshot())
}
