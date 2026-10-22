// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 代理运行时：按配置装配 token 管理器 / provider / 路由，并管理 HTTP 监听的启停。
//!
//! 桌面端通过 `Backend` 嵌入代理：config.json 由外层 ConfigStore 统一写入，
//! 因此这里构建的 token 管理器不会自行回写 config.json。

use crate::admin::AdminService;
use crate::anthropic;
use crate::anthropic::middleware::AppState;
use crate::cache;
use crate::cache::breakpoint::BreakpointCache;
use crate::cache::fingerprint::FingerprintTracker;
use crate::http_client::{InvalidProxyError, ProxyConfig, validate_proxy_url};
use crate::kiro::model::credentials::{CredentialsConfig, KiroCredentials};
use crate::kiro::provider::KiroProvider;
use crate::kiro::token_manager::MultiTokenManager;
use crate::log_capture::LogCapture;
use crate::model::config::Config;
use crate::paths::AppPaths;
use crate::stores::Stores;
use axum::Router;
use chrono::{DateTime, Utc};
use serde::Serialize;
use std::net::{SocketAddr, ToSocketAddrs};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use std::time::Duration;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

/// 优雅关闭的最长等待：超时后不再等待（不 abort），在途请求在后台继续完成
pub const GRACEFUL_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    pub running: bool,
    pub host: String,
    pub port: u16,
    pub base_url: String,
    pub started_at: Option<DateTime<Utc>>,
    pub last_error: Option<String>,
}

/// 运行中的 HTTP 服务句柄
pub struct ServerHandle {
    host: String,
    local_addr: SocketAddr,
    started_at: DateTime<Utc>,
    /// 监听 socket 的副本（dup）：同地址重建运行时时直接交给新服务，无需停机重绑
    listener: std::net::TcpListener,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

impl ServerHandle {
    pub fn host(&self) -> &str {
        &self.host
    }

    pub fn port(&self) -> u16 {
        self.local_addr.port()
    }

    /// 实际绑定的地址
    pub fn local_addr(&self) -> SocketAddr {
        self.local_addr
    }

    /// 复制监听 socket（同一地址交接给新的运行时）
    pub fn try_clone_listener(&self) -> std::io::Result<std::net::TcpListener> {
        self.listener.try_clone()
    }

    /// 发出关闭信号：立即停止接受新连接并释放监听端口，已建立的连接继续处理；
    /// 最多等待 `timeout`，返回是否在超时前全部结束（超时不 abort，在途请求在后台完成）
    pub async fn shutdown(self, timeout: Duration) -> bool {
        let Self {
            listener,
            shutdown,
            task,
            ..
        } = self;
        drop(listener);
        let _ = shutdown.send(());
        tokio::time::timeout(timeout, task).await.is_ok()
    }
}

/// `host` 是否可直接作为 URL 主机（IPv6 需要加方括号）
fn url_host(host: &str) -> String {
    if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    }
}

/// 绑定监听地址（不启动服务）：用于「先绑新端口，成功后再停旧服务」
pub fn bind_listener(host: &str, port: u16) -> anyhow::Result<std::net::TcpListener> {
    let listener = std::net::TcpListener::bind((host, port))
        .map_err(|e| anyhow::anyhow!("监听 {}:{} 失败：{e}", url_host(host), port))?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

/// `host:port` 是否解析到 `addr`（判断重建前后是否为同一监听地址，如 localhost 与 127.0.0.1）
pub fn resolves_to(host: &str, port: u16, addr: SocketAddr) -> bool {
    (host, port)
        .to_socket_addrs()
        .map(|mut addrs| addrs.any(|a| a == addr))
        .unwrap_or(false)
}

pub struct Backend {
    pub token_manager: Arc<MultiTokenManager>,
    pub admin: Arc<AdminService>,
    pub router: Router,
    pub server: Option<ServerHandle>,
    pub suggestion_mode: Arc<AtomicBool>,
    pub generation: u64,
    fingerprint: Arc<FingerprintTracker>,
    breakpoint_cache: Option<Arc<BreakpointCache>>,
}

impl Backend {
    pub fn build(
        paths: &AppPaths,
        config: &Config,
        stores: &Stores,
        _capture: Arc<LogCapture>,
    ) -> anyhow::Result<Self> {
        // 手工编辑 config.json 留下的空字符串等价于未配置代理
        let proxy_url = config
            .proxy_url
            .as_deref()
            .map(str::trim)
            .filter(|url| !url.is_empty());
        // 代理地址来自用户可编辑的 config.json：无效时返回可读错误，不能 panic
        if let Some(url) = proxy_url {
            validate_proxy_url(url).map_err(|e| {
                anyhow::Error::new(InvalidProxyError(format!(
                    "代理地址无效：{e}。请修正 config.json 中的 proxyUrl"
                )))
            })?;
        }

        let credentials_path = paths.credentials();
        let credentials_config = CredentialsConfig::load(&credentials_path)?;
        let is_multiple = credentials_config.is_multiple();
        let credentials_list = credentials_config.into_sorted_credentials();
        let first: KiroCredentials = credentials_list.first().cloned().unwrap_or_default();

        let proxy_config = proxy_url.map(|url| {
            let mut proxy = ProxyConfig::new(url);
            if let (Some(u), Some(p)) = (&config.proxy_username, &config.proxy_password) {
                proxy = proxy.with_auth(u, p);
            }
            proxy
        });

        let token_manager = Arc::new(MultiTokenManager::new(
            config.clone(),
            credentials_list,
            proxy_config.clone(),
            Some(credentials_path),
            is_multiple,
        )?);
        // config.json 的唯一写入方是外层 ConfigStore
        token_manager.disable_config_writes();

        let provider = KiroProvider::with_proxy(token_manager.clone(), proxy_config)?
            .with_rpm_tracker(stores.rpm.clone())
            .with_throttle_log_store(stores.throttle.clone())
            .with_failure_log_store(stores.failure.clone());

        let fingerprint = cache::fingerprint::FingerprintTracker::new(config.cache_simulation);
        let suggestion_mode = Arc::new(AtomicBool::new(config.forward_suggestion_mode));
        let mut app_state = AppState::new()
            .with_rpm_tracker(stores.rpm.clone())
            .with_forward_suggestion_mode_arc(suggestion_mode.clone())
            .with_fingerprint_tracker(fingerprint.clone())
            .with_api_key_manager(stores.api_keys.clone())
            .with_usage_tracker(stores.usage.clone());

        let breakpoint_cache = if config.prompt_cache_accounting {
            let cache = Arc::new(BreakpointCache::new(
                config.prompt_cache_min_tokens,
                Some(paths.prompt_cache()),
            ));
            // 维护任务只持有 Weak，运行时退役/释放后自动退出；丢弃 JoinHandle 不会取消任务
            drop(cache.start_maintenance());
            app_state = app_state.with_breakpoint_cache(cache.clone());
            Some(cache)
        } else {
            None
        };

        let router = anthropic::create_router_with_provider_and_state(
            app_state,
            Some(provider),
            first.profile_arn.clone(),
        );

        let admin = Arc::new(
            AdminService::new(token_manager.clone())
                .with_throttle_log_store(stores.throttle.clone()),
        );

        Ok(Self {
            token_manager,
            admin,
            router,
            server: None,
            suggestion_mode,
            generation: 0,
            fingerprint,
            breakpoint_cache,
        })
    }

    /// 按配置的监听地址绑定并启动服务
    pub fn start_server(&mut self, config: &Config) -> anyhow::Result<()> {
        if self.server.is_some() {
            anyhow::bail!("代理服务已在运行");
        }
        let listener = bind_listener(&config.host, config.port)?;
        self.start_with_listener(listener, &config.host)
    }

    /// 用已绑定的监听 socket 启动服务（先绑定新地址、确认成功后再切换）
    pub fn start_with_listener(
        &mut self,
        listener: std::net::TcpListener,
        host: &str,
    ) -> anyhow::Result<()> {
        if self.server.is_some() {
            anyhow::bail!("代理服务已在运行");
        }
        listener.set_nonblocking(true)?;
        let keep = listener.try_clone()?;
        let local_addr = listener.local_addr()?;
        let listener = tokio::net::TcpListener::from_std(listener)?;
        let (shutdown, rx) = oneshot::channel();
        let router = self.router.clone();
        let task = tokio::spawn(async move {
            let server = axum::serve(
                listener,
                router.into_make_service_with_connect_info::<std::net::SocketAddr>(),
            )
            .with_graceful_shutdown(async {
                let _ = rx.await;
            });
            if let Err(e) = server.await {
                tracing::error!("代理服务退出: {e}");
            }
        });
        self.server = Some(ServerHandle {
            host: host.to_string(),
            local_addr,
            started_at: Utc::now(),
            listener: keep,
            shutdown,
            task,
        });
        Ok(())
    }

    /// 取出服务句柄（调用方在锁外 `shutdown().await`，避免持锁等待优雅关闭）
    pub fn take_server(&mut self) -> Option<ServerHandle> {
        self.server.take()
    }

    pub async fn stop_server(&mut self) {
        if let Some(handle) = self.server.take() {
            handle.shutdown(GRACEFUL_SHUTDOWN_TIMEOUT).await;
        }
    }

    /// 立即落盘防抖中的数据（账号统计、prompt cache 快照）。退出前、重建运行时前调用
    pub fn flush(&self) {
        self.token_manager.flush();
        if let Some(cache) = &self.breakpoint_cache {
            cache.save_snapshot();
        }
    }

    /// 退役：运行时被新实例替换后调用。在途请求仍可用旧实例完成，
    /// 但旧实例不再写 credentials.json / kiro_stats.json / 快照，后台任务全部停止
    pub fn retire(&self) {
        self.token_manager.retire();
        if let Some(cache) = &self.breakpoint_cache {
            cache.stop_maintenance(false);
        }
        self.fingerprint.shutdown();
    }

    pub fn is_retired(&self) -> bool {
        self.token_manager.is_retired()
    }

    /// 断点缓存表（未开启 promptCacheAccounting 时为 None）
    pub fn breakpoint_cache(&self) -> Option<&Arc<BreakpointCache>> {
        self.breakpoint_cache.as_ref()
    }

    pub fn status(&self) -> ServerStatus {
        match &self.server {
            Some(s) => ServerStatus {
                running: true,
                host: s.host.clone(),
                port: s.port(),
                base_url: format!("http://{}:{}", url_host(&s.host), s.port()),
                started_at: Some(s.started_at),
                last_error: None,
            },
            None => ServerStatus {
                running: false,
                host: String::new(),
                port: 0,
                base_url: String::new(),
                started_at: None,
                last_error: None,
            },
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_config(port: u16) -> Config {
        let mut config = Config::default();
        config.host = "127.0.0.1".into();
        config.port = port;
        config
    }

    // MultiTokenManager::new 会调用 block_in_place 写入账号 ID 计数器，
    // 该 API 要求 multi-thread runtime。
    #[tokio::test(flavor = "multi_thread")]
    async fn starts_and_stops_on_ephemeral_port() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let config = test_config(0); // 由系统分配
        let stores = Stores::load(&paths).unwrap();
        let capture = Arc::new(LogCapture::new(16));
        let mut backend = Backend::build(&paths, &config, &stores, capture).unwrap();
        backend.start_server(&config).unwrap();
        assert!(backend.status().running);
        assert!(backend.status().port > 0);
        backend.stop_server().await;
        assert!(!backend.status().running);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn bind_conflict_returns_error_and_keeps_stopped() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let stores = Stores::load(&paths).unwrap();
        let capture = Arc::new(LogCapture::new(16));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let config = test_config(port);
        let mut backend = Backend::build(&paths, &config, &stores, capture).unwrap();
        assert!(backend.start_server(&config).is_err());
        assert!(!backend.status().running);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn invalid_proxy_url_fails_build_without_panic() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let stores = Stores::load(&paths).unwrap();
        let mut config = test_config(0);
        config.proxy_url = Some("ftp://127.0.0.1:21".into());
        let err = match Backend::build(&paths, &config, &stores, Arc::new(LogCapture::new(4))) {
            Ok(_) => panic!("无效代理地址应构建失败"),
            Err(e) => e,
        };
        assert!(err.downcast_ref::<InvalidProxyError>().is_some());
        assert!(err.to_string().contains("请修正 config.json 中的 proxyUrl"));
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn shutdown_releases_port_and_handover_keeps_serving() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let stores = Stores::load(&paths).unwrap();
        let config = test_config(0);
        let mut old =
            Backend::build(&paths, &config, &stores, Arc::new(LogCapture::new(4))).unwrap();
        old.start_server(&config).unwrap();
        let addr = old.server.as_ref().unwrap().local_addr();
        assert!(resolves_to("127.0.0.1", addr.port(), addr));

        // 同地址交接：新运行时直接接管监听 socket，旧服务关闭后端口仍在服务
        let mut next =
            Backend::build(&paths, &config, &stores, Arc::new(LogCapture::new(4))).unwrap();
        let listener = old.server.as_ref().unwrap().try_clone_listener().unwrap();
        next.start_with_listener(listener, "127.0.0.1").unwrap();
        old.retire();
        assert!(old.is_retired());
        old.take_server()
            .unwrap()
            .shutdown(GRACEFUL_SHUTDOWN_TIMEOUT)
            .await;
        assert_eq!(next.status().port, addr.port());
        let mut stream = tokio::net::TcpStream::connect(addr).await.unwrap();
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        stream
            .write_all(b"GET /v1/ping HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n")
            .await
            .unwrap();
        let mut buf = Vec::new();
        stream.read_to_end(&mut buf).await.unwrap();
        assert!(String::from_utf8_lossy(&buf).starts_with("HTTP/1.1 200"));

        // 关闭后端口立即可重新绑定
        next.take_server()
            .unwrap()
            .shutdown(GRACEFUL_SHUTDOWN_TIMEOUT)
            .await;
        let rebound = bind_listener("127.0.0.1", addr.port());
        assert!(rebound.is_ok(), "{:?}", rebound.err());
    }

    #[test]
    fn url_host_brackets_ipv6() {
        assert_eq!(url_host("127.0.0.1"), "127.0.0.1");
        assert_eq!(url_host("::1"), "[::1]");
        assert_eq!(url_host("localhost"), "localhost");
    }
}
