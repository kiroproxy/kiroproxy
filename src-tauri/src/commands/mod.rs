// Copyright (c) 2026 pigcursor. Licensed under MIT.

pub mod accounts;
pub mod api_keys;
pub mod app;
pub mod kiro_ide;
pub mod logs;
pub mod models;
pub mod oauth;
pub mod settings;
pub mod updater;
pub mod usage;

use crate::error::IpcError;

/// 在阻塞线程池执行同步逻辑（磁盘写入带 fsync，macOS 上是 F_FULLFSYNC）。
///
/// Tauri 的同步命令跑在主线程，做磁盘 IO 或等锁会卡住界面，这类命令统一改为
/// async 并把阻塞部分放到这里。
pub(crate) async fn blocking<T, F>(f: F) -> Result<T, IpcError>
where
    F: FnOnce() -> Result<T, IpcError> + Send + 'static,
    T: Send + 'static,
{
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(IpcError::internal)?
}
