// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::error::IpcError;
use kiro_core::app_logging;
use kiro_core::config_store::ConfigStore;
use kiro_core::http_client::InvalidProxyError;
use kiro_core::log_capture::LogCapture;
use kiro_core::model::config::Config;
use kiro_core::paths::AppPaths;
use kiro_core::runtime::Backend;
use kiro_core::stores::Stores;
use parking_lot::{Mutex, RwLock};
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

/// 开发/测试用：设置后以该目录作为数据根目录，不再使用系统的 app_data_dir
pub const DATA_DIR_ENV: &str = "KIROPROXY_DATA_DIR";

/// 环境变量覆盖的数据目录（未设置或为空时为 None）
pub fn data_dir_override() -> Option<std::path::PathBuf> {
    std::env::var_os(DATA_DIR_ENV)
        .filter(|value| !value.is_empty())
        .map(std::path::PathBuf::from)
}

pub struct Core {
    pub paths: AppPaths,
    pub config_store: ConfigStore,
    pub config: RwLock<Config>,
    pub stores: Stores,
    pub log_capture: Arc<LogCapture>,
    /// 只做短时间的读写（取 admin、换实例、取服务句柄），不得持锁 await
    pub backend: RwLock<Backend>,
    /// 串行化配置写入（config.json + 内存配置 + 运行时开关作为一个整体）
    pub persist_lock: Mutex<()>,
    /// 串行化启动/停止/重启：同一时刻只有一个生命周期操作，异步锁可跨 await 持有
    pub lifecycle: tokio::sync::Mutex<()>,
    pub server_error: RwLock<Option<String>>,
}

impl std::fmt::Debug for Core {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Core")
            .field("paths", &self.paths)
            .finish_non_exhaustive()
    }
}

impl Core {
    /// 当前 admin 服务（短暂读锁，克隆 Arc 后立即释放）
    pub fn admin(&self) -> Arc<kiro_core::admin::AdminService> {
        self.backend.read().admin.clone()
    }

    /// 退出前落盘：账号统计（30s 防抖）、prompt cache 快照、用量 / 限流 / 失败日志
    pub fn flush_all(&self) {
        self.backend.read().flush();
        self.stores.flush();
    }
}

pub struct AppState {
    pub paths: AppPaths,
    pub core: RwLock<Option<Arc<Core>>>,
    pub startup_error: RwLock<Option<IpcError>>,
    pub verify_cancel: AtomicBool,
}

/// 把启动失败转换成带错误码的 IpcError，便于启动错误页给出明确的修复提示
pub fn startup_error(e: &anyhow::Error) -> IpcError {
    if let Some(proxy) = e.downcast_ref::<InvalidProxyError>() {
        return IpcError::new("invalid_proxy", proxy.to_string());
    }
    IpcError::new("internal_error", format!("{e:#}"))
}

impl AppState {
    pub fn try_new(paths: AppPaths) -> anyhow::Result<Self> {
        // Tauri 的 setup 钩子与同步命令运行在没有 Tokio 上下文的主线程上，
        // 而 Stores::load / Backend::build 会 tokio::spawn 后台任务。
        // 无上下文时借 Tauri 全局异步运行时补齐，保证启动与重试路径行为一致。
        if tokio::runtime::Handle::try_current().is_ok() {
            return Self::try_new_inner(paths);
        }
        tauri::async_runtime::block_on(async move { Self::try_new_inner(paths) })
    }

    fn try_new_inner(paths: AppPaths) -> anyhow::Result<Self> {
        Ok(Self {
            paths: paths.clone(),
            core: RwLock::new(Some(Arc::new(Self::build_core(&paths)?))),
            startup_error: RwLock::new(None),
            verify_cancel: AtomicBool::new(false),
        })
    }

    fn build_core(paths: &AppPaths) -> anyhow::Result<Core> {
        kiro_core::paths::init_global(paths.clone());
        let config_store = ConfigStore::new(paths.config());
        let config = config_store.load_or_create()?;
        if !paths.credentials().exists() {
            kiro_core::common::fs::atomic_write(&paths.credentials(), b"[]")?;
        }
        // 旧版本写出的数据文件可能是 0644，启动时统一收紧
        paths.harden_permissions();
        let log_capture = app_logging::init(&config, paths)?;
        // 应用 token 直通、thinking 文本化、分块写入等进程级开关。
        crate::services::settings::apply_runtime_flags(&config);
        let stores = Stores::load(paths)?;
        stores.ensure_default_api_key()?;
        let mut backend = Backend::build(paths, &config, &stores, log_capture.clone())?;
        let server_error = backend.start_server(&config).err().map(|e| e.to_string());
        if let Some(e) = &server_error {
            tracing::error!("代理服务启动失败: {e}");
        }
        Ok(Core {
            paths: paths.clone(),
            config_store,
            config: RwLock::new(config),
            stores,
            log_capture,
            backend: RwLock::new(backend),
            persist_lock: Mutex::new(()),
            lifecycle: tokio::sync::Mutex::new(()),
            server_error: RwLock::new(server_error),
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

    /// 重试启动（阻塞，调用方需放在阻塞线程池）。已成功初始化时直接返回
    pub fn retry(&self) -> Result<(), IpcError> {
        if self.core.read().is_some() {
            return Ok(());
        }
        match Self::try_new(self.paths.clone()) {
            Ok(next) => {
                *self.core.write() = next.core.into_inner();
                *self.startup_error.write() = None;
                Ok(())
            }
            Err(e) => {
                let error = startup_error(&e);
                *self.startup_error.write() = Some(error.clone());
                Err(error)
            }
        }
    }
}

#[cfg(test)]
pub mod test_support {
    use super::*;

    /// 测试用应用状态：独立临时数据目录 + 系统分配的临时端口（绝不绑定 5678）
    pub fn test_state() -> (tempfile::TempDir, AppState) {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        std::fs::write(paths.config(), r#"{"host":"127.0.0.1","port":0}"#).unwrap();
        let state = AppState::try_new(paths).unwrap();
        (dir, state)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn try_new_creates_default_key_and_config() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        // 测试用临时端口，绝不绑定真实实例使用的 5678
        std::fs::write(paths.config(), r#"{"host":"127.0.0.1","port":0}"#).unwrap();
        let state = AppState::try_new(paths).unwrap();
        let core = state.core().unwrap();
        assert_eq!(core.config.read().port, 0);
        assert_eq!(core.stores.api_keys.list().len(), 1);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in [core.paths.credentials(), core.paths.api_keys()] {
                let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
                assert_eq!(mode, 0o600, "{}", path.display());
            }
        }
    }

    #[test]
    fn failed_state_returns_startup_error() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let state = AppState::failed(paths, IpcError::new("config_invalid", "bad"));
        assert_eq!(state.core().unwrap_err().code, "config_invalid");
    }

    #[test]
    fn invalid_saved_proxy_becomes_startup_error_instead_of_panic() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        std::fs::write(
            paths.config(),
            r#"{"host":"127.0.0.1","port":0,"proxyUrl":"ftp://127.0.0.1:21"}"#,
        )
        .unwrap();
        let err = match AppState::try_new(paths) {
            Ok(_) => panic!("无效代理地址应启动失败"),
            Err(e) => e,
        };
        let ipc = startup_error(&err);
        assert_eq!(ipc.code, "invalid_proxy");
        assert!(ipc.message.contains("代理地址无效"));
        assert!(ipc.message.contains("proxyUrl"));
    }
}
