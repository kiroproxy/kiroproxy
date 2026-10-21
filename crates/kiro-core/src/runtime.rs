// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::admin::AdminService;
use crate::anthropic;
use crate::anthropic::middleware::AppState;
use crate::cache;
use crate::http_client::ProxyConfig;
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
use std::sync::Arc;
use std::sync::atomic::AtomicBool;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

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

pub struct ServerHandle {
    host: String,
    port: u16,
    started_at: DateTime<Utc>,
    shutdown: oneshot::Sender<()>,
    task: JoinHandle<()>,
}

pub struct Backend {
    pub token_manager: Arc<MultiTokenManager>,
    pub admin: Arc<AdminService>,
    pub router: Router,
    pub server: Option<ServerHandle>,
    pub suggestion_mode: Arc<AtomicBool>,
    pub generation: u64,
}

impl Backend {
    pub fn build(
        paths: &AppPaths,
        config: &Config,
        stores: &Stores,
        _capture: Arc<LogCapture>,
    ) -> anyhow::Result<Self> {
        let credentials_path = paths.credentials();
        let credentials_config = CredentialsConfig::load(&credentials_path)?;
        let is_multiple = credentials_config.is_multiple();
        let credentials_list = credentials_config.into_sorted_credentials();
        let first: KiroCredentials = credentials_list.first().cloned().unwrap_or_default();

        let proxy_config = config.proxy_url.as_ref().map(|url| {
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

        let fingerprint = cache::fingerprint::FingerprintTracker::new(config.cache_simulation);
        let suggestion_mode = Arc::new(AtomicBool::new(config.forward_suggestion_mode));
        let mut app_state = AppState::new()
            .with_rpm_tracker(stores.rpm.clone())
            .with_forward_suggestion_mode_arc(suggestion_mode.clone())
            .with_fingerprint_tracker(fingerprint)
            .with_api_key_manager(stores.api_keys.clone())
            .with_usage_tracker(stores.usage.clone());

        if config.prompt_cache_accounting {
            let cache = Arc::new(cache::breakpoint::BreakpointCache::new(
                config.prompt_cache_min_tokens,
                Some(paths.prompt_cache()),
            ));
            cache.start_maintenance();
            app_state = app_state.with_breakpoint_cache(cache);
        }

        let provider = KiroProvider::with_proxy(token_manager.clone(), proxy_config)
            .with_rpm_tracker(stores.rpm.clone())
            .with_throttle_log_store(stores.throttle.clone())
            .with_failure_log_store(stores.failure.clone());

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
        })
    }

    pub fn start_server(&mut self, config: &Config) -> anyhow::Result<()> {
        self.stop_server_sync();
        let addr = format!("{}:{}", config.host, config.port);
        let listener = std::net::TcpListener::bind(&addr)?;
        listener.set_nonblocking(true)?;
        let listener = tokio::net::TcpListener::from_std(listener)?;
        let port = listener.local_addr()?.port();
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
            host: config.host.clone(),
            port,
            started_at: Utc::now(),
            shutdown,
            task,
        });
        Ok(())
    }

    fn stop_server_sync(&mut self) {
        if let Some(handle) = self.server.take() {
            let _ = handle.shutdown.send(());
            handle.task.abort();
        }
    }

    pub async fn stop_server(&mut self) {
        if let Some(handle) = self.server.take() {
            let _ = handle.shutdown.send(());
            let _ = tokio::time::timeout(std::time::Duration::from_secs(3), handle.task).await;
        }
    }

    pub fn status(&self) -> ServerStatus {
        match &self.server {
            Some(s) => ServerStatus {
                running: true,
                host: s.host.clone(),
                port: s.port,
                base_url: format!("http://{}:{}", s.host, s.port),
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

    // MultiTokenManager::new 会调用 block_in_place 写入账号 ID 计数器，
    // 该 API 要求 multi-thread runtime。
    #[tokio::test(flavor = "multi_thread")]
    async fn starts_and_stops_on_ephemeral_port() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let mut config = Config::default();
        config.host = "127.0.0.1".into();
        config.port = 0; // 由系统分配
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
        let mut config = Config::default();
        config.port = port;
        let mut backend = Backend::build(&paths, &config, &stores, capture).unwrap();
        assert!(backend.start_server(&config).is_err());
        assert!(!backend.status().running);
    }
}
