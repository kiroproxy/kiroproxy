// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::state::{AppState, Core};
use kiro_core::log_capture::LogEntry;
use kiro_core::model::failure_log::{FailureLogItem, FailureLogsPage};
use kiro_core::model::throttle_log::{ThrottleLogItem, ThrottleLogsPage};
use std::path::PathBuf;

const DEFAULT_PAGE_SIZE: usize = 50;

#[tauri::command]
pub fn get_log_snapshot(state: tauri::State<'_, AppState>) -> Result<Vec<LogEntry>, IpcError> {
    let core = state.core()?;
    Ok(core.log_capture.snapshot())
}

#[tauri::command]
pub fn get_throttle_logs(
    state: tauri::State<'_, AppState>,
    credential_id: Option<u64>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<ThrottleLogsPage, IpcError> {
    let core = state.core()?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(DEFAULT_PAGE_SIZE).max(1);
    Ok(match credential_id {
        Some(id) => core.stores.throttle.get_paged(id, page, page_size),
        None => aggregate_throttle_logs(&core, page, page_size),
    })
}

#[tauri::command]
pub fn get_failure_logs(
    state: tauri::State<'_, AppState>,
    credential_id: Option<u64>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<FailureLogsPage, IpcError> {
    let core = state.core()?;
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(DEFAULT_PAGE_SIZE).max(1);
    Ok(match credential_id {
        Some(id) => core.stores.failure.get_paged(id, page, page_size),
        None => aggregate_failure_logs(&core, page, page_size),
    })
}

#[tauri::command]
pub fn export_logs(
    state: tauri::State<'_, AppState>,
    kind: String,
    dest_path: String,
) -> Result<String, IpcError> {
    let core = state.core()?;
    let (source, empty): (PathBuf, &'static [u8]) = match kind.as_str() {
        "runtime" => (core.paths.log_file(), b""),
        "throttle" => (core.paths.throttle_log(), b"[]"),
        "failure" => (core.paths.failure_log(), b"[]"),
        _ => return Err(IpcError::new("invalid_request", "未知日志类型")),
    };
    if source.exists() {
        std::fs::copy(&source, &dest_path)?;
    } else {
        std::fs::write(&dest_path, empty)?;
    }
    Ok(dest_path)
}

/// 未指定账号时汇总所有账号的限流日志；单个账号最多保留 500 条。
fn aggregate_throttle_logs(core: &Core, page: usize, page_size: usize) -> ThrottleLogsPage {
    let mut records: Vec<ThrottleLogItem> = Vec::new();
    for id in credential_ids(core) {
        records.extend(core.stores.throttle.get_paged(id, 1, usize::MAX).records);
    }
    let total = records.len();
    records.sort_by_key(|r| std::cmp::Reverse(r.created_at));
    let total_pages = total.div_ceil(page_size);
    let page = page.max(1).min(total_pages.max(1));
    let start = (page - 1) * page_size;
    let records = records.into_iter().skip(start).take(page_size).collect();
    ThrottleLogsPage {
        records,
        total,
        page,
        page_size,
        total_pages,
    }
}

/// 未指定账号时汇总所有账号的失败日志；单个账号最多保留 500 条。
fn aggregate_failure_logs(core: &Core, page: usize, page_size: usize) -> FailureLogsPage {
    let mut records: Vec<FailureLogItem> = Vec::new();
    for id in credential_ids(core) {
        records.extend(core.stores.failure.get_paged(id, 1, usize::MAX).records);
    }
    let total = records.len();
    records.sort_by_key(|r| std::cmp::Reverse(r.created_at));
    let total_pages = total.div_ceil(page_size);
    let page = page.max(1).min(total_pages.max(1));
    let start = (page - 1) * page_size;
    let records = records.into_iter().skip(start).take(page_size).collect();
    FailureLogsPage {
        records,
        total,
        page,
        page_size,
        total_pages,
    }
}

fn credential_ids(core: &Core) -> Vec<u64> {
    core.backend
        .read()
        .admin
        .get_all_credentials()
        .credentials
        .into_iter()
        .map(|c| c.id)
        .collect()
}
