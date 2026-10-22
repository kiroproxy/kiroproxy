// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::model::api_key::{ApiKey, ApiKeyManager};
use crate::model::failure_log::FailureLogStore;
use crate::model::rpm::RpmTracker;
use crate::model::throttle_log::ThrottleLogStore;
use crate::model::usage::UsageTracker;
use crate::paths::AppPaths;
use std::sync::Arc;

pub struct Stores {
    pub api_keys: Arc<ApiKeyManager>,
    pub usage: Arc<UsageTracker>,
    pub rpm: Arc<RpmTracker>,
    pub throttle: Arc<ThrottleLogStore>,
    pub failure: Arc<FailureLogStore>,
}

impl Stores {
    pub fn load(paths: &AppPaths) -> anyhow::Result<Self> {
        let api_keys = Arc::new(ApiKeyManager::load(paths.api_keys())?);
        let usage = Arc::new(UsageTracker::load(paths.usage())?);
        api_keys.seed_id_counter_at_least(usage.max_api_key_id());
        let throttle = Arc::new(ThrottleLogStore::load(paths.throttle_log())?);
        let failure = Arc::new(FailureLogStore::load(paths.failure_log())?);
        Ok(Self {
            api_keys,
            usage,
            rpm: Arc::new(RpmTracker::new()),
            throttle,
            failure,
        })
    }

    /// 同步落盘所有周期写入的存储（退出时调用）；单个失败只记录，不影响其余存储
    pub fn flush(&self) {
        if let Err(e) = self.usage.flush() {
            tracing::error!("退出前保存用量记录失败: {e}");
        }
        if let Err(e) = self.throttle.flush() {
            tracing::error!("退出前保存限流日志失败: {e}");
        }
        if let Err(e) = self.failure.flush() {
            tracing::error!("退出前保存失败日志失败: {e}");
        }
    }

    pub fn ensure_default_api_key(&self) -> anyhow::Result<Option<ApiKey>> {
        if !self.api_keys.list().is_empty() {
            return Ok(None);
        }
        Ok(Some(self.api_keys.create(
            "本机默认".to_string(),
            None,
            None,
            Some("usd".to_string()),
            None,
            None,
        )?))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Stores::load 内部的 UsageTracker/ThrottleLogStore/FailureLogStore 会
    // tokio::spawn 后台刷盘任务，故测试需运行在 Tokio runtime 内。
    #[tokio::test]
    async fn creates_default_key_when_empty() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let stores = Stores::load(&paths).unwrap();
        assert!(stores.api_keys.list().is_empty());
        let created = stores.ensure_default_api_key().unwrap();
        assert_eq!(created.unwrap().name, "本机默认");
        assert_eq!(stores.api_keys.list().len(), 1);
    }

    #[tokio::test]
    async fn keeps_existing_keys_untouched() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let stores = Stores::load(&paths).unwrap();
        stores
            .api_keys
            .create("已有".into(), None, None, Some("usd".into()), None, None)
            .unwrap();
        assert!(stores.ensure_default_api_key().unwrap().is_none());
        assert_eq!(stores.api_keys.list().len(), 1);
    }

    #[tokio::test]
    async fn does_not_write_ip2region_database() {
        // 归属地库已移除：启动不再向数据目录写出 11MB 的 xdb 文件
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let _stores = Stores::load(&paths).unwrap();
        assert!(!dir.path().join("ip2region_v4.xdb").exists());
    }

    #[cfg(unix)]
    #[tokio::test]
    async fn flush_writes_private_files() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let stores = Stores::load(&paths).unwrap();
        stores.ensure_default_api_key().unwrap();
        stores.throttle.record(1, "api", 429, "{}", None);
        stores.failure.record(1, "api", 403, "{}");
        stores.flush();
        for path in [
            paths.api_keys(),
            paths.usage(),
            paths.throttle_log(),
            paths.failure_log(),
        ] {
            let mode = std::fs::metadata(&path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "{}", path.display());
        }
        assert!(
            std::fs::read_to_string(paths.throttle_log())
                .unwrap()
                .contains("429")
        );
    }
}
