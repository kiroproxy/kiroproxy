// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 代理服务生命周期：启动 / 停止 / 重建运行时。
//!
//! 锁约定：`Core::lifecycle`（异步互斥）串行化生命周期操作，可以跨 await 持有；
//! `Core::backend` 的写锁只用于取出服务句柄、替换运行时这类瞬时操作，绝不跨 await。
//! 因此 `get_server_status`（同步命令，跑在主线程）不会被优雅关闭的等待卡住。

use crate::error::IpcError;
use crate::state::{Core, startup_error};
use kiro_core::runtime::{
    Backend, GRACEFUL_SHUTDOWN_TIMEOUT, ServerStatus, bind_listener, resolves_to,
};
use std::sync::Arc;

/// 当前服务状态（含最近一次启动失败原因）
pub fn status(core: &Core) -> ServerStatus {
    let mut status = core.backend.read().status();
    status.last_error = core.server_error.read().clone();
    status
}

fn bind_failed(core: &Core, e: impl std::fmt::Display) -> IpcError {
    let msg = e.to_string();
    tracing::error!("代理服务启动失败: {msg}");
    *core.server_error.write() = Some(msg.clone());
    IpcError::new("server_bind_failed", msg)
}

/// 启动服务（已在运行时直接返回当前状态）
pub async fn start(core: &Core) -> Result<ServerStatus, IpcError> {
    let _life = core.lifecycle.lock().await;
    if core.backend.read().server.is_some() {
        return Ok(status(core));
    }
    let config = core.config.read().clone();
    let listener = bind_listener(&config.host, config.port).map_err(|e| bind_failed(core, e))?;
    core.backend
        .write()
        .start_with_listener(listener, &config.host)
        .map_err(|e| bind_failed(core, e))?;
    *core.server_error.write() = None;
    Ok(status(core))
}

/// 停止服务：短锁内取出句柄，锁外等待优雅关闭（最多 3 秒，超时不中断在途请求）
pub async fn stop(core: &Core) -> Result<ServerStatus, IpcError> {
    let _life = core.lifecycle.lock().await;
    let handle = core.backend.write().take_server();
    if let Some(handle) = handle {
        handle.shutdown(GRACEFUL_SHUTDOWN_TIMEOUT).await;
    }
    *core.server_error.write() = None;
    Ok(status(core))
}

/// 按当前配置重建代理运行时并切换过去
///
/// - 监听地址不变：新运行时直接接管旧的监听 socket，没有停机窗口；
/// - 监听地址变化：先绑定新地址，成功后才停止旧服务；绑定失败时旧服务原样继续运行，
///   返回 `server_bind_failed`（状态仍显示真实的运行地址，并带上 lastError）；
/// - 旧服务本就未运行：切换到新运行时（新配置对管理操作立即生效），再尝试启动。
///
/// 构建新运行时之前旧运行时先落盘（新实例从磁盘读到最新状态）；切换完成后旧实例退役，
/// 只服务在途请求，不会与新实例并发写 credentials.json / kiro_stats.json。
pub async fn restart(core: Arc<Core>) -> Result<ServerStatus, IpcError> {
    let _life = core.lifecycle.lock().await;
    let config = core.config.read().clone();

    let builder = core.clone();
    let build_config = config.clone();
    let built = tokio::task::spawn_blocking(move || {
        // 先把旧运行时防抖中的数据落盘（锁外执行 fsync），新实例从磁盘读到最新状态
        let (generation, token_manager, cache) = {
            let old = builder.backend.read();
            (
                old.generation + 1,
                old.token_manager.clone(),
                old.breakpoint_cache().cloned(),
            )
        };
        token_manager.flush();
        if let Some(cache) = cache {
            cache.save_snapshot();
        }
        Backend::build(
            &builder.paths,
            &build_config,
            &builder.stores,
            builder.log_capture.clone(),
        )
        .map(|mut next| {
            next.generation = generation;
            next
        })
    })
    .await
    .map_err(IpcError::internal)?;

    // 新运行时构建失败（如代理地址无效）：旧实例原样继续服务
    let mut next = built.map_err(|e| startup_error(&e))?;

    // 同地址直接复用旧 socket（复制句柄），否则先绑定新地址
    let reuse = {
        let backend = core.backend.read();
        backend.server.as_ref().and_then(|server| {
            let same_addr = config.port != 0
                && server.port() == config.port
                && (server.host() == config.host
                    || resolves_to(&config.host, config.port, server.local_addr()));
            same_addr.then(|| server.try_clone_listener())
        })
    };
    let listener = match reuse {
        Some(cloned) => cloned.map_err(anyhow::Error::from),
        None => bind_listener(&config.host, config.port),
    };
    let started = listener.and_then(|listener| next.start_with_listener(listener, &config.host));

    if let Err(e) = started {
        let old_running = core.backend.read().server.is_some();
        if old_running {
            // 旧服务保持原样继续运行；新运行时作废（停止其后台任务）
            next.retire();
            return Err(bind_failed(&core, e));
        }
        // 旧服务本就未运行：仍切换到新运行时，让新配置对账号/模型等管理操作生效
        let old = std::mem::replace(&mut *core.backend.write(), next);
        old.retire();
        return Err(bind_failed(&core, e));
    }

    // 瞬时写锁内替换实例并取出旧句柄，锁外等待旧服务优雅关闭
    let (old, old_server) = {
        let mut guard = core.backend.write();
        let old_server = guard.take_server();
        let old = std::mem::replace(&mut *guard, next);
        (old, old_server)
    };
    old.retire();
    *core.server_error.write() = None;
    if let Some(handle) = old_server {
        handle.shutdown(GRACEFUL_SHUTDOWN_TIMEOUT).await;
    }
    drop(old);
    Ok(status(&core))
}

/// 退出时停止服务（阻塞调用，最多等待 `timeout`）
pub fn shutdown_blocking(core: &Core, timeout: std::time::Duration) {
    let handle = core.backend.write().take_server();
    if let Some(handle) = handle {
        tauri::async_runtime::block_on(handle.shutdown(timeout));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::test_support::test_state;

    async fn ping(port: u16) -> String {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut stream = tokio::net::TcpStream::connect(("127.0.0.1", port))
            .await
            .unwrap();
        stream
            .write_all(b"GET /v1/ping HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        String::from_utf8_lossy(&buf).to_string()
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn stop_then_start_again() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        assert!(status(&core).running);
        let stopped = stop(&core).await.unwrap();
        assert!(!stopped.running);
        let started = start(&core).await.unwrap();
        assert!(started.running);
        assert!(started.last_error.is_none());
        assert!(ping(started.port).await.starts_with("HTTP/1.1 200"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn restart_on_changed_port_binds_new_first() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        let before = status(&core);
        let generation = core.backend.read().generation;
        // 配置端口为 0：每次都绑定新的临时端口
        let after = restart(core.clone()).await.unwrap();
        assert!(after.running);
        assert_ne!(after.port, before.port);
        assert_eq!(core.backend.read().generation, generation + 1);
        assert!(ping(after.port).await.starts_with("HTTP/1.1 200"));
        // 旧端口已释放
        assert!(bind_listener("127.0.0.1", before.port).is_ok());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn restart_bind_failure_keeps_old_server_running() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        let before = status(&core);
        let occupied = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let busy_port = occupied.local_addr().unwrap().port();
        core.config.write().port = busy_port;

        let err = restart(core.clone()).await.unwrap_err();
        assert_eq!(err.code, "server_bind_failed");
        let after = status(&core);
        assert!(after.running, "旧服务必须继续运行");
        assert_eq!(after.port, before.port);
        assert!(after.last_error.is_some());
        assert!(!core.backend.read().is_retired(), "旧运行时继续负责持久化");
        assert!(ping(after.port).await.starts_with("HTTP/1.1 200"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn restart_on_same_address_hands_over_listener() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        let port = status(&core).port;
        core.config.write().port = port;
        let after = restart(core.clone()).await.unwrap();
        assert!(after.running);
        assert_eq!(after.port, port);
        assert!(after.last_error.is_none());
        assert!(ping(port).await.starts_with("HTTP/1.1 200"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn restart_when_stopped_starts_new_runtime() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        stop(&core).await.unwrap();
        let after = restart(core.clone()).await.unwrap();
        assert!(after.running);
        assert!(ping(after.port).await.starts_with("HTTP/1.1 200"));
    }
}
