// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::commands::blocking;
use crate::error::IpcError;
use crate::state::{AppState, Core};
use chrono::{DateTime, Utc};
use kiro_core::log_capture::LogEntry;
use kiro_core::model::failure_log::{FailureLogItem, FailureLogsPage};
use kiro_core::model::throttle_log::{ThrottleLogItem, ThrottleLogsPage};
use std::path::PathBuf;
use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

const DEFAULT_PAGE_SIZE: usize = 50;

#[tauri::command]
pub fn get_log_snapshot(state: tauri::State<'_, AppState>) -> Result<Vec<LogEntry>, IpcError> {
    let core = state.core()?;
    Ok(core.log_capture.snapshot())
}

/// 汇总所有账号时要克隆并排序全部事件（每账号最多 500 条），放到阻塞线程池
#[tauri::command]
pub async fn get_throttle_logs(
    state: tauri::State<'_, AppState>,
    credential_id: Option<u64>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<ThrottleLogsPage, IpcError> {
    let core = state.core()?;
    blocking(move || Ok(throttle_logs(&core, credential_id, page, page_size))).await
}

fn throttle_logs(
    core: &Core,
    credential_id: Option<u64>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> ThrottleLogsPage {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(DEFAULT_PAGE_SIZE).max(1);
    match credential_id {
        Some(id) => core.stores.throttle.get_paged(id, page, page_size),
        None => {
            let (records, total, page, total_pages) = aggregate(core, page, page_size, |id| {
                core.stores.throttle.get_paged(id, 1, usize::MAX).records
            });
            ThrottleLogsPage {
                records,
                total,
                page,
                page_size,
                total_pages,
            }
        }
    }
}

#[tauri::command]
pub async fn get_failure_logs(
    state: tauri::State<'_, AppState>,
    credential_id: Option<u64>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> Result<FailureLogsPage, IpcError> {
    let core = state.core()?;
    blocking(move || Ok(failure_logs(&core, credential_id, page, page_size))).await
}

fn failure_logs(
    core: &Core,
    credential_id: Option<u64>,
    page: Option<usize>,
    page_size: Option<usize>,
) -> FailureLogsPage {
    let page = page.unwrap_or(1).max(1);
    let page_size = page_size.unwrap_or(DEFAULT_PAGE_SIZE).max(1);
    match credential_id {
        Some(id) => core.stores.failure.get_paged(id, page, page_size),
        None => {
            let (records, total, page, total_pages) = aggregate(core, page, page_size, |id| {
                core.stores.failure.get_paged(id, 1, usize::MAX).records
            });
            FailureLogsPage {
                records,
                total,
                page,
                page_size,
                total_pages,
            }
        }
    }
}

/// 日志导出的源文件、空文件时的默认内容与保存对话框的默认文件名
fn export_source(
    core: &Core,
    kind: &str,
) -> Result<(PathBuf, &'static [u8], &'static str), IpcError> {
    match kind {
        "runtime" => Ok((core.paths.log_file(), b"", "kiroproxy-runtime.log")),
        "throttle" => Ok((core.paths.throttle_log(), b"[]", "kiroproxy-throttle.json")),
        "failure" => Ok((core.paths.failure_log(), b"[]", "kiroproxy-failure.json")),
        _ => Err(IpcError::new("invalid_request", "未知日志类型")),
    }
}

/// 复制日志到用户选择的位置（源文件不存在时写入空内容）
fn copy_log(
    source: &std::path::Path,
    dest: &std::path::Path,
    empty: &[u8],
) -> Result<(), IpcError> {
    if source.exists() {
        std::fs::copy(source, dest)?;
    } else {
        std::fs::write(dest, empty)?;
    }
    Ok(())
}

/// 导出日志：由 Rust 弹出原生保存对话框，返回保存路径；用户取消时返回 None。
///
/// 对话框用回调式 API（插件在主线程上异步显示，结果经 oneshot 送回），
/// 命令本身是 async，不会在主线程上阻塞等待。
#[tauri::command]
pub async fn export_logs(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    kind: String,
) -> Result<Option<String>, IpcError> {
    let core = state.core()?;
    let (source, empty, file_name) = export_source(&core, &kind)?;
    if kind != "runtime" {
        // 先把内存中的最新事件落盘，导出内容与界面一致
        let store_flush = if kind == "throttle" {
            let store = core.stores.throttle.clone();
            blocking(move || store.flush().map_err(IpcError::from)).await
        } else {
            let store = core.stores.failure.clone();
            blocking(move || store.flush().map_err(IpcError::from)).await
        };
        if let Err(e) = store_flush {
            tracing::warn!("导出前落盘日志失败: {e}");
        }
    }

    let (tx, rx) = tokio::sync::oneshot::channel();
    let mut dialog = app
        .dialog()
        .file()
        .set_title("导出日志")
        .set_file_name(file_name);
    if let Some(window) = app.get_webview_window("main") {
        dialog = dialog.set_parent(&window);
    }
    dialog.save_file(move |path| {
        let _ = tx.send(path);
    });
    let Some(path) = rx.await.map_err(IpcError::internal)? else {
        return Ok(None);
    };
    let dest = path
        .into_path()
        .map_err(|e| IpcError::new("invalid_request", format!("无法保存到该位置：{e}")))?;

    blocking(move || {
        copy_log(&source, &dest, empty)?;
        Ok(Some(dest.to_string_lossy().to_string()))
    })
    .await
}

/// 带创建时间的日志记录（限流 / 失败日志共用的聚合分页）
trait CreatedAt {
    fn created_at(&self) -> DateTime<Utc>;
}

impl CreatedAt for ThrottleLogItem {
    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }
}

impl CreatedAt for FailureLogItem {
    fn created_at(&self) -> DateTime<Utc> {
        self.created_at
    }
}

/// 未指定账号时汇总所有账号的日志（单个账号最多保留 500 条），按时间倒序分页。
///
/// 返回 (当前页记录, 总数, 实际页码, 总页数)。
fn aggregate<T: CreatedAt>(
    core: &Core,
    page: usize,
    page_size: usize,
    fetch: impl Fn(u64) -> Vec<T>,
) -> (Vec<T>, usize, usize, usize) {
    let mut records: Vec<T> = credential_ids(core).into_iter().flat_map(fetch).collect();
    paginate(&mut records, page, page_size)
}

fn paginate<T: CreatedAt>(
    records: &mut Vec<T>,
    page: usize,
    page_size: usize,
) -> (Vec<T>, usize, usize, usize) {
    let total = records.len();
    records.sort_by_key(|r| std::cmp::Reverse(r.created_at()));
    let total_pages = total.div_ceil(page_size);
    let page = page.max(1).min(total_pages.max(1));
    let start = (page - 1) * page_size;
    let page_records = records.drain(..).skip(start).take(page_size).collect();
    (page_records, total, page, total_pages)
}

fn credential_ids(core: &Core) -> Vec<u64> {
    core.admin()
        .get_all_credentials()
        .credentials
        .into_iter()
        .map(|c| c.id)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: u64, minutes: i64) -> ThrottleLogItem {
        ThrottleLogItem {
            credential_id: id,
            request_type: "api".into(),
            status_code: 429,
            response_body: String::new(),
            created_at: Utc::now() - chrono::Duration::minutes(minutes),
            endpoint: None,
        }
    }

    #[test]
    fn paginate_sorts_newest_first_and_clamps_page() {
        let mut records = vec![item(1, 30), item(2, 10), item(1, 20), item(3, 0)];
        let (page, total, current, pages) = paginate(&mut records, 1, 3);
        assert_eq!(total, 4);
        assert_eq!(pages, 2);
        assert_eq!(current, 1);
        assert_eq!(
            page.iter().map(|r| r.credential_id).collect::<Vec<_>>(),
            vec![3, 2, 1]
        );

        let mut records = vec![item(1, 30), item(2, 10)];
        let (page, _, current, _) = paginate(&mut records, 9, 1);
        assert_eq!(current, 2);
        assert_eq!(page[0].credential_id, 1);

        let mut empty: Vec<ThrottleLogItem> = Vec::new();
        let (page, total, current, pages) = paginate(&mut empty, 3, 50);
        assert!(page.is_empty());
        assert_eq!((total, current, pages), (0, 1, 0));
    }

    #[test]
    fn copy_log_writes_default_when_source_missing() {
        let dir = tempfile::tempdir().unwrap();
        let dest = dir.path().join("out.json");
        copy_log(&dir.path().join("missing.json"), &dest, b"[]").unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "[]");

        let source = dir.path().join("src.log");
        std::fs::write(&source, "line\n").unwrap();
        copy_log(&source, &dest, b"").unwrap();
        assert_eq!(std::fs::read_to_string(&dest).unwrap(), "line\n");
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn export_source_maps_kinds_to_default_file_names() {
        let (_dir, state) = crate::state::test_support::test_state();
        let core = state.core().unwrap();
        assert_eq!(
            export_source(&core, "runtime").unwrap().2,
            "kiroproxy-runtime.log"
        );
        assert_eq!(
            export_source(&core, "throttle").unwrap().2,
            "kiroproxy-throttle.json"
        );
        assert_eq!(
            export_source(&core, "failure").unwrap().2,
            "kiroproxy-failure.json"
        );
        assert_eq!(
            export_source(&core, "other").unwrap_err().code,
            "invalid_request"
        );
    }
}
