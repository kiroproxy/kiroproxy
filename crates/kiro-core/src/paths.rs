// Copyright (c) 2026 Harllan He. Licensed under MIT.

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
    pub fn ip2region(&self) -> PathBuf {
        self.root.join("ip2region_v4.xdb")
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
}
