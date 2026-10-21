// Copyright (c) 2026 Harllan He. Licensed under MIT.

//! 设置服务：SettingsView 汇总、热生效开关与需重建字段的持久化。
use crate::error::IpcError;
use crate::state::Core;
use kiro_core::admin::types::SetLoadBalancingModeRequest;
use kiro_core::model::config::{Config, TlsBackend};
use serde::{Deserialize, Serialize};
use serde_json::json;

#[cfg(test)]
use crate::state::AppState;
#[cfg(test)]
use kiro_core::paths::AppPaths;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub host: String,
    pub port: u16,
    pub region: String,
    pub auth_region: Option<String>,
    pub api_region: Option<String>,
    pub proxy_url: Option<String>,
    pub proxy_configured: bool,
    pub proxy_auth_configured: bool,
    pub tls_backend: String,
    pub load_balancing_mode: String,
    pub max_rpm_per_credential: u32,
    pub write_chunking_max_lines: u32,
    pub forward_suggestion_mode: bool,
    pub client_token_passthrough: bool,
    pub thinking_as_text: bool,
    pub debug_logs: bool,
    pub dump_kiro_body: bool,
    pub prompt_cache_accounting: bool,
    pub output_tokens_include_thinking: bool,
    pub models_official_aliases: bool,
    pub data_dir: String,
    pub config_path: String,
    pub credentials_path: String,
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub applied: Vec<String>,
    pub restart_required: Vec<String>,
    pub settings: SettingsView,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfigPatch {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub proxy_url: Option<String>,
    pub proxy_username: Option<String>,
    pub proxy_password: Option<String>,
    pub tls_backend: Option<String>,
    pub region: Option<String>,
    pub auth_region: Option<String>,
    pub api_region: Option<String>,
}

impl ApplyResult {
    fn applied(core: &Core, field: &str) -> Self {
        Self {
            applied: vec![field.to_string()],
            restart_required: Vec::new(),
            settings: settings_view(core),
        }
    }

    fn needs_restart(core: &Core, fields: Vec<String>) -> Self {
        Self {
            applied: Vec::new(),
            restart_required: fields,
            settings: settings_view(core),
        }
    }
}

pub fn settings_view(core: &Core) -> SettingsView {
    let config = core.config.read().clone();
    let backend = core.backend.read();
    let version = env!("CARGO_PKG_VERSION").to_string();
    SettingsView {
        host: config.host.clone(),
        port: config.port,
        region: config.region.clone(),
        auth_region: config.auth_region.clone(),
        api_region: config.api_region.clone(),
        proxy_url: config.proxy_url.clone(),
        proxy_configured: config.proxy_url.is_some(),
        proxy_auth_configured: config.proxy_username.is_some(),
        tls_backend: match config.tls_backend {
            TlsBackend::Rustls => "rustls".to_string(),
            TlsBackend::NativeTls => "native-tls".to_string(),
        },
        load_balancing_mode: backend.admin.get_load_balancing_mode().mode,
        max_rpm_per_credential: backend.admin.max_rpm_per_credential(),
        write_chunking_max_lines: config.write_chunking_max_lines,
        forward_suggestion_mode: config.forward_suggestion_mode,
        client_token_passthrough: config.client_token_passthrough,
        thinking_as_text: config.thinking_as_text,
        debug_logs: config.debug_logs,
        dump_kiro_body: config.dump_kiro_body,
        prompt_cache_accounting: config.prompt_cache_accounting,
        output_tokens_include_thinking: config.output_tokens_include_thinking,
        models_official_aliases: config.models_official_aliases,
        data_dir: core.paths.root().to_string_lossy().to_string(),
        config_path: core.config_store.path().to_string_lossy().to_string(),
        credentials_path: core.paths.credentials().to_string_lossy().to_string(),
        version,
    }
}

pub fn set_suggestion_mode(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("forwardSuggestionMode", json!(enabled))?;
    core.config.write().forward_suggestion_mode = enabled;
    core.backend
        .read()
        .suggestion_mode
        .store(enabled, std::sync::atomic::Ordering::Relaxed);
    Ok(ApplyResult::applied(core, "forwardSuggestionMode"))
}

pub fn set_client_token_passthrough(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("clientTokenPassthrough", json!(enabled))?;
    core.config.write().client_token_passthrough = enabled;
    kiro_core::anthropic::set_client_token_passthrough(enabled);
    Ok(ApplyResult::applied(core, "clientTokenPassthrough"))
}

pub fn set_thinking_as_text(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("thinkingAsText", json!(enabled))?;
    core.config.write().thinking_as_text = enabled;
    kiro_core::anthropic::set_thinking_as_text(enabled);
    Ok(ApplyResult::applied(core, "thinkingAsText"))
}

pub fn set_dump_kiro_body(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("dumpKiroBody", json!(enabled))?;
    core.config.write().dump_kiro_body = enabled;
    kiro_core::anthropic::set_kiro_body_dump_enabled(enabled);
    Ok(ApplyResult::applied(core, "dumpKiroBody"))
}

pub fn set_write_chunking_max_lines(core: &Core, value: u32) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("writeChunkingMaxLines", json!(value))?;
    core.config.write().write_chunking_max_lines = value;
    kiro_core::anthropic::set_write_chunking_max_lines(value);
    Ok(ApplyResult::applied(core, "writeChunkingMaxLines"))
}

pub fn set_debug_logs(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("debugLogs", json!(enabled))?;
    core.config.write().debug_logs = enabled;
    kiro_core::logging::set_debug_enabled(enabled)
        .map_err(|e| IpcError::new("logging_unavailable", e))?;
    Ok(ApplyResult::applied(core, "debugLogs"))
}

pub fn set_load_balancing_mode(core: &Core, mode: String) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.backend
        .read()
        .admin
        .set_load_balancing_mode(SetLoadBalancingModeRequest { mode: mode.clone() })
        .map_err(IpcError::internal)?;
    core.config_store
        .update_field("loadBalancingMode", json!(&mode))?;
    core.config.write().load_balancing_mode = mode;
    Ok(ApplyResult::applied(core, "loadBalancingMode"))
}

pub fn set_max_rpm_per_credential(core: &Core, value: u32) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.backend.read().admin.set_max_rpm_per_credential(value);
    core.config_store
        .update_field("maxRpmPerCredential", json!(value))?;
    core.config.write().max_rpm_per_credential = value;
    Ok(ApplyResult::applied(core, "maxRpmPerCredential"))
}

/// 应用需要重建代理运行时才能在下次启动生效的字段。
///
/// 所有字段都会持久化并同步到内存配置，但只有调用方在 `restart_required`
/// 非空时重启代理，监听地址、代理、TLS 与区域才会真正生效。
pub fn set_runtime_config(core: &Core, patch: RuntimeConfigPatch) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    let mut restart_required: Vec<String> = Vec::new();
    {
        let mut config = core.config.write();

        if let Some(host) = patch.host {
            core.config_store.update_field("host", json!(&host))?;
            config.host = host;
            restart_required.push("host".to_string());
        }
        if let Some(port) = patch.port {
            core.config_store.update_field("port", json!(port))?;
            config.port = port;
            restart_required.push("port".to_string());
        }
        if let Some(proxy_url) = patch.proxy_url {
            let value = normalize_optional(proxy_url);
            core.config_store.update_field("proxyUrl", json!(&value))?;
            config.proxy_url = value;
            restart_required.push("proxyUrl".to_string());
        }
        if let Some(proxy_username) = patch.proxy_username {
            let value = normalize_optional(proxy_username);
            core.config_store
                .update_field("proxyUsername", json!(&value))?;
            config.proxy_username = value;
            restart_required.push("proxyUsername".to_string());
        }
        if let Some(proxy_password) = patch.proxy_password {
            let value = normalize_optional(proxy_password);
            core.config_store
                .update_field("proxyPassword", json!(&value))?;
            config.proxy_password = value;
            restart_required.push("proxyPassword".to_string());
        }
        if let Some(tls_backend) = patch.tls_backend {
            let value = match tls_backend.as_str() {
                "rustls" => TlsBackend::Rustls,
                "native-tls" => TlsBackend::NativeTls,
                _ => {
                    return Err(IpcError::new(
                        "invalid_request",
                        "tlsBackend 必须是 rustls 或 native-tls",
                    ));
                }
            };
            core.config_store
                .update_field("tlsBackend", json!(&tls_backend))?;
            config.tls_backend = value;
            restart_required.push("tlsBackend".to_string());
        }
        if let Some(region) = patch.region {
            core.config_store.update_field("region", json!(&region))?;
            config.region = region;
            restart_required.push("region".to_string());
        }
        if let Some(auth_region) = patch.auth_region {
            let value = normalize_optional(auth_region);
            core.config_store
                .update_field("authRegion", json!(&value))?;
            config.auth_region = value;
            restart_required.push("authRegion".to_string());
        }
        if let Some(api_region) = patch.api_region {
            let value = normalize_optional(api_region);
            core.config_store.update_field("apiRegion", json!(&value))?;
            config.api_region = value;
            restart_required.push("apiRegion".to_string());
        }
    }
    Ok(ApplyResult::needs_restart(core, restart_required))
}

/// 启动时把配置文件中的进程级开关应用到运行时。
pub fn apply_runtime_flags(config: &Config) {
    kiro_core::anthropic::set_client_token_passthrough(config.client_token_passthrough);
    kiro_core::anthropic::set_thinking_as_text(config.thinking_as_text);
    kiro_core::anthropic::set_output_tokens_include_thinking(config.output_tokens_include_thinking);
    kiro_core::anthropic::set_models_official_aliases(config.models_official_aliases);
    kiro_core::anthropic::set_write_chunking_max_lines(config.write_chunking_max_lines);
    kiro_core::anthropic::set_kiro_body_dump_enabled(config.dump_kiro_body);
}

fn normalize_optional(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // MultiTokenManager::new 会调用 block_in_place 写入账号 ID 计数器，
    // 该 API 要求 multi-thread runtime。
    #[tokio::test(flavor = "multi_thread")]
    async fn toggling_suggestion_mode_persists_and_updates_switch() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let state = AppState::try_new(paths.clone()).unwrap();
        let core = state.core().unwrap();
        set_suggestion_mode(&core, true).unwrap();
        let raw: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(paths.config()).unwrap()).unwrap();
        assert_eq!(raw["forwardSuggestionMode"], true);
        assert!(
            core.backend
                .read()
                .suggestion_mode
                .load(std::sync::atomic::Ordering::Relaxed)
        );
    }

    #[test]
    fn runtime_config_marks_restart_required() {
        let dir = tempfile::tempdir().unwrap();
        let paths = AppPaths::new(dir.path().to_path_buf()).unwrap();
        let state = AppState::try_new(paths).unwrap();
        let core = state.core().unwrap();
        let result = set_runtime_config(
            &core,
            RuntimeConfigPatch {
                port: Some(6000),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(result.restart_required.contains(&"port".to_string()));
        assert_eq!(core.config.read().port, 6000);
    }
}
