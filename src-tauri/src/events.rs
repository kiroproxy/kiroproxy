// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 后端 → 前端事件转发。

use kiro_core::log_capture::LogEntry;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::broadcast::Receiver;
use tokio::sync::broadcast::error::RecvError;

/// 运行日志批量事件：payload 为非空的 `LogEntry[]`
pub const LOG_BATCH_EVENT: &str = "log://batch";
/// 批量转发间隔：开启 DEBUG 时日志量很大，逐条 emit 会压垮 IPC 与前端渲染
const LOG_FLUSH_INTERVAL: Duration = Duration::from_millis(150);
/// 单批上限：防止突发日志把一次 IPC 消息撑得过大
const LOG_BATCH_MAX: usize = 1000;

pub fn spawn_log_forwarder(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            // 日志捕获层是进程级单例：启动失败（如配置无效）时可能尚未初始化，等待重试启动
            let Some(capture) = kiro_core::app_logging::capture() else {
                tokio::time::sleep(Duration::from_secs(1)).await;
                continue;
            };
            let receiver = capture.subscribe();
            forward_batches(receiver, |batch| {
                let _ = app.emit(LOG_BATCH_EVENT, batch);
            })
            .await;
        }
    });
}

/// 从广播接收端收集日志，每 `LOG_FLUSH_INTERVAL` 发送一批（仅非空时发送）。
///
/// 接收落后（`Lagged`）时跳过被覆盖的条目继续转发，而不是退出循环；
/// 发送端关闭时把剩余条目发出后返回。
async fn forward_batches(mut receiver: Receiver<LogEntry>, mut emit: impl FnMut(Vec<LogEntry>)) {
    let mut pending: Vec<LogEntry> = Vec::new();
    let mut ticker = tokio::time::interval(LOG_FLUSH_INTERVAL);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            result = receiver.recv() => match result {
                Ok(entry) => {
                    pending.push(entry);
                    if pending.len() >= LOG_BATCH_MAX {
                        emit(std::mem::take(&mut pending));
                    }
                }
                Err(RecvError::Lagged(skipped)) => {
                    tracing::debug!("日志转发落后，跳过 {skipped} 条");
                }
                Err(RecvError::Closed) => {
                    if !pending.is_empty() {
                        emit(std::mem::take(&mut pending));
                    }
                    return;
                }
            },
            _ = ticker.tick() => {
                if !pending.is_empty() {
                    emit(std::mem::take(&mut pending));
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use kiro_core::log_capture::LogCapture;
    use std::sync::{Arc, Mutex};

    #[tokio::test]
    async fn batches_entries_and_skips_empty_flushes() {
        let capture = LogCapture::new(100);
        let receiver = capture.subscribe();
        let batches: Arc<Mutex<Vec<Vec<LogEntry>>>> = Arc::default();
        let sink = batches.clone();
        let task = tokio::spawn(async move {
            forward_batches(receiver, move |batch| sink.lock().unwrap().push(batch)).await;
        });
        for i in 0..5 {
            capture.record("INFO", "kiro_core", format!("line {i}"));
        }
        tokio::time::sleep(LOG_FLUSH_INTERVAL * 3).await;
        drop(capture);
        task.await.unwrap();

        let batches = batches.lock().unwrap();
        assert!(!batches.is_empty());
        assert!(batches.iter().all(|b| !b.is_empty()), "不得发送空批次");
        let seqs: Vec<u64> = batches.iter().flatten().map(|e| e.seq).collect();
        assert_eq!(seqs.len(), 5);
        assert!(seqs.windows(2).all(|w| w[0] < w[1]));
    }

    #[tokio::test]
    async fn keeps_forwarding_after_lag() {
        let capture = LogCapture::new(10_000);
        let receiver = capture.subscribe();
        // 订阅后先写入超过广播缓冲容量的日志，让接收端落后
        for i in 0..5000 {
            capture.record("DEBUG", "kiro_core", format!("burst {i}"));
        }
        let batches: Arc<Mutex<Vec<Vec<LogEntry>>>> = Arc::default();
        let sink = batches.clone();
        let task = tokio::spawn(async move {
            forward_batches(receiver, move |batch| sink.lock().unwrap().push(batch)).await;
        });
        tokio::time::sleep(LOG_FLUSH_INTERVAL * 2).await;
        capture.record("INFO", "kiro_core", "after lag");
        tokio::time::sleep(LOG_FLUSH_INTERVAL * 3).await;
        drop(capture);
        task.await.unwrap();

        let batches = batches.lock().unwrap();
        let all: Vec<&LogEntry> = batches.iter().flatten().collect();
        assert!(
            all.iter().any(|e| e.message == "after lag"),
            "落后后仍继续转发"
        );
        assert!(
            batches
                .iter()
                .all(|b| !b.is_empty() && b.len() <= LOG_BATCH_MAX)
        );
    }
}
