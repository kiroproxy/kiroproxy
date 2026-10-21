// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use kiro_core::app_logging;
use kiro_core::config_store::ConfigStore;
use kiro_core::log_capture::LogCapture;
use kiro_core::model::config::Config;
use kiro_core::paths::AppPaths;
use kiro_core::runtime::Backend;
use kiro_core::stores::Stores;
use parking_lot::{Mutex, RwLock};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

pub struct Core {
    pub paths: AppPaths,
    pub config_store: ConfigStore,
    pub config: RwLock<Config>,
    pub stores: Stores,
    pub log_capture: Arc<LogCapture>,
    pub backend: RwLock<Backend>,
    // 供后续配置/账号命令串行化持久化写入使用。
    #[allow(dead_code)]
    pub persist_lock: Mutex<()>,
    pub server_error: RwLock<Option<String>>,
}

impl std::fmt::Debug for Core {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Core")
            .field("paths", &self.paths)
            .finish_non_exhaustive()
    }
}

pub struct AppState {
    pub paths: AppPaths,
    pub core: RwLock<Option<Arc<Core>>>,
    pub startup_error: RwLock<Option<IpcError>>,
    // 供后续账号验证命令取消使用。
    #[allow(dead_code)]
    pub verify_cancel: AtomicBool,
}

impl AppState {
    pub fn try_new(paths: AppPaths) -> anyhow::Result<Self> {
        // Tauri 的 setup 钩子与同步命令运行在没有 Tokio 上下文的主线程上，
        // 而 Stores::load / Backend::start_server 会 tokio::spawn 后台任务。
        // 无上下文时借 Tauri 全局异步运行时补齐，保证启动与重试路径行为一致。
        if tokio::runtime::Handle::try_current().is_ok() {
            return Self::try_new_inner(paths);
        }
        tauri::async_runtime::block_on(async move { Self::try_new_inner(paths) })
    }

    fn try_new_inner(paths: AppPaths) -> anyhow::Result<Self> {
        kiro_core::paths::init_global(paths.clone());
        let config_store = ConfigStore::new(paths.config());
        let config = config_store.load_or_create()?;
        if !paths.credentials().exists() {
            std::fs::write(paths.credentials(), b"[]")?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(
                    paths.credentials(),
                    std::fs::Permissions::from_mode(0o600),
                );
            }
        }
        let log_capture = app_logging::init(&config, &paths)?;
        // 应用 token 直通、thinking 文本化、分块写入等进程级开关。
        crate::services::settings::apply_runtime_flags(&config);
        let stores = Stores::load(&paths)?;
        stores.ensure_default_api_key()?;
        let mut backend = Backend::build(&paths, &config, &stores, log_capture.clone())?;
        let server_error = backend.start_server(&config).err().map(|e| e.to_string());
        Ok(Self {
            paths: paths.clone(),
            core: RwLock::new(Some(Arc::new(Core {
                paths: paths.clone(),
                config_store,
                config: RwLock::new(config),
                stores,
                log_capture,
                backend: RwLock::new(backend),
                persist_lock: Mutex::new(()),
                server_error: RwLock::new(server_error),
            }))),
            startup_error: RwLock::new(None),
            verify_cancel: AtomicBool::new(false),
        })
    }

    pub fn failed(paths: AppPaths, error: IpcError) -> Self {
        Self {
            paths,
            core: RwLock::new(None),
            startup_error: RwLock::new(Some(error)),
            verify_cancel: AtomicBool::new(false),
        }
    }

    pub fn core(&self) -> Result<Arc<Core>, IpcError> {
        self.core.read().clone().ok_or_else(|| {
            self.startup_error
                .read()
                .clone()
                .unwrap_or_else(|| IpcError::new("not_initialized", "应用尚未初始化"))
        })
    }

    pub fn retry(&self) -> Result<(), IpcError> {
        match Self::try_new(self.paths.clone()) {
            Ok(next) => {
                *self.core.write() = next.core.into_inner();
                *self.startup_error.write() = None;
                Ok(())
            }
            Err(e) => {
                *self.startup_error.write() = Some(IpcError::internal(&e));
                Err(IpcError::internal(e))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn try_new_creates_default_key_and_config() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let state = AppState::try_new(paths).unwrap();
        let core = state.core().unwrap();
        assert_eq!(core.config.read().port, 5678);
        assert_eq!(core.stores.api_keys.list().len(), 1);
    }

    #[test]
    fn failed_state_returns_startup_error() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let state = AppState::failed(paths, IpcError::new("config_invalid", "bad"));
        assert_eq!(state.core().unwrap_err().code, "config_invalid");
    }
}
