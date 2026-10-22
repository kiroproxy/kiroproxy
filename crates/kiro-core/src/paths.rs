// Copyright (c) 2026 pigcursor. Licensed under MIT.

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

static GLOBAL: OnceLock<AppPaths> = OnceLock::new();

#[derive(Clone, Debug)]
pub struct AppPaths {
    root: PathBuf,
}

impl AppPaths {
    pub fn new(root: PathBuf) -> anyhow::Result<Self> {
        let paths = Self { root };
        std::fs::create_dir_all(paths.logs_dir())?;
        std::fs::create_dir_all(paths.kiro_body_dump_dir())?;
        Ok(paths)
    }

    pub fn root(&self) -> &Path {
        &self.root
    }
    pub fn config(&self) -> PathBuf {
        self.root.join("config.json")
    }
    pub fn credentials(&self) -> PathBuf {
        self.root.join("credentials.json")
    }
    pub fn api_keys(&self) -> PathBuf {
        self.root.join("api_keys.json")
    }
    pub fn usage(&self) -> PathBuf {
        self.root.join("api_key_usage.json")
    }
    pub fn api_key_lifetime(&self) -> PathBuf {
        self.root.join("api_key_lifetime.json")
    }
    pub fn api_key_counter(&self) -> PathBuf {
        self.root.join("api_key_id_counter.json")
    }
    pub fn throttle_log(&self) -> PathBuf {
        self.root.join("throttle_log.json")
    }
    pub fn failure_log(&self) -> PathBuf {
        self.root.join("failure_log.json")
    }
    pub fn prompt_cache(&self) -> PathBuf {
        self.root.join("prompt_cache.json")
    }
    pub fn logs_dir(&self) -> PathBuf {
        self.root.join("logs")
    }
    pub fn log_file(&self) -> PathBuf {
        self.logs_dir().join("proxy.log")
    }
    pub fn kiro_body_dump_dir(&self) -> PathBuf {
        self.root.join("kiro-body-dump")
    }

    /// 含账号凭据、API Key、用量与日志的数据文件（启动时统一收紧为 0600）
    pub fn sensitive_files(&self) -> Vec<PathBuf> {
        let mut files = vec![
            self.config(),
            self.credentials(),
            self.api_keys(),
            self.usage(),
            self.api_key_lifetime(),
            self.api_key_counter(),
            self.throttle_log(),
            self.failure_log(),
            self.prompt_cache(),
            self.log_file(),
        ];
        files.extend(
            [
                "kiro_stats.json",
                "kiro_balance_cache.json",
                "kiro_id_counter.json",
                "kiro_model_seen.json",
            ]
            .into_iter()
            .map(|name| self.root.join(name)),
        );
        files
    }

    /// 把已存在的数据文件权限收紧为 0600（旧版本写出的文件可能是 0644）；不存在的文件忽略
    pub fn harden_permissions(&self) {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            for path in self.sensitive_files() {
                let Ok(meta) = std::fs::metadata(&path) else {
                    continue;
                };
                if meta.permissions().mode() & 0o077 != 0
                    && let Err(e) =
                        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                {
                    tracing::warn!("收紧文件权限失败 {}: {e}", path.display());
                }
            }
        }
    }
}

pub fn init_global(paths: AppPaths) {
    let _ = GLOBAL.set(paths);
}

pub fn global() -> Option<&'static AppPaths> {
    GLOBAL.get()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_all_directories_and_paths() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        assert!(paths.root().is_dir());
        assert!(paths.logs_dir().is_dir());
        assert!(paths.kiro_body_dump_dir().is_dir());
        assert_eq!(paths.config(), dir.path().join("config.json"));
        assert_eq!(paths.credentials(), dir.path().join("credentials.json"));
        assert_eq!(paths.log_file(), dir.path().join("logs/proxy.log"));
    }

    #[cfg(unix)]
    #[test]
    fn harden_permissions_tightens_existing_files_only() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        std::fs::write(paths.credentials(), b"[]").unwrap();
        std::fs::set_permissions(paths.credentials(), std::fs::Permissions::from_mode(0o644))
            .unwrap();
        paths.harden_permissions();
        let mode = std::fs::metadata(paths.credentials())
            .unwrap()
            .permissions()
            .mode()
            & 0o777;
        assert_eq!(mode, 0o600);
        // 不存在的文件不会被创建
        assert!(!paths.api_keys().exists());
    }
}
