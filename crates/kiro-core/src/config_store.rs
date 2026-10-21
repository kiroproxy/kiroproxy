// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::common::fs::atomic_write;
use crate::model::config::Config;
use parking_lot::Mutex;
use serde_json::Value;
use std::path::{Path, PathBuf};

pub struct ConfigStore {
    path: PathBuf,
    lock: Mutex<()>,
}

impl ConfigStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            lock: Mutex::new(()),
        }
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn load_or_create(&self) -> anyhow::Result<Config> {
        if !self.path.exists() {
            let mut config = Config::default();
            config.host = "127.0.0.1".to_string();
            config.port = 5678;
            self.save(&config)?;
            return Ok(config);
        }
        Config::load(&self.path)
    }

    pub fn save(&self, config: &Config) -> anyhow::Result<()> {
        let _guard = self.lock.lock();
        let json = serde_json::to_vec_pretty(config)?;
        self.write_bytes(&json)
    }

    pub fn update_field(&self, key: &str, value: Value) -> anyhow::Result<()> {
        let _guard = self.lock.lock();
        let mut json: Value = if self.path.exists() {
            serde_json::from_str(&std::fs::read_to_string(&self.path)?)?
        } else {
            serde_json::json!({})
        };
        let obj = json
            .as_object_mut()
            .ok_or_else(|| anyhow::anyhow!("config.json 不是对象"))?;
        obj.insert(key.to_string(), value);
        self.write_bytes(&serde_json::to_vec_pretty(&json)?)
    }

    fn write_bytes(&self, bytes: &[u8]) -> anyhow::Result<()> {
        atomic_write(&self.path, bytes)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&self.path, std::fs::Permissions::from_mode(0o600));
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_default_config_with_port_5678() {
        let dir = tempfile::tempdir().unwrap();
        let store = ConfigStore::new(dir.path().join("config.json"));
        let config = store.load_or_create().unwrap();
        assert_eq!(config.port, 5678);
        assert!(store.path().is_file());
    }

    #[test]
    fn update_field_preserves_unknown_fields() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("config.json");
        std::fs::write(&path, r#"{"port":5678,"unknownField":42}"#).unwrap();
        let store = ConfigStore::new(path.clone());
        store.update_field("port", serde_json::json!(6000)).unwrap();
        let raw: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(path).unwrap()).unwrap();
        assert_eq!(raw["port"], 6000);
        assert_eq!(raw["unknownField"], 42);
    }
}
