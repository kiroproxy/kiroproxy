// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 设置服务：SettingsView 汇总、热生效开关与需重建字段的持久化。
use crate::error::IpcError;
use crate::state::Core;
use kiro_core::admin::types::SetLoadBalancingModeRequest;
use kiro_core::model::config::{Config, TlsBackend};
use serde::{Deserialize, Serialize};
use serde_json::json;

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
    pub max_effort: String,
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
    let admin = core.admin();
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
        load_balancing_mode: admin.get_load_balancing_mode().mode,
        max_rpm_per_credential: admin.max_rpm_per_credential(),
        write_chunking_max_lines: config.write_chunking_max_lines,
        max_effort: config.max_effort.clone(),
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

pub fn set_output_tokens_include_thinking(
    core: &Core,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("outputTokensIncludeThinking", json!(enabled))?;
    core.config.write().output_tokens_include_thinking = enabled;
    kiro_core::anthropic::set_output_tokens_include_thinking(enabled);
    Ok(ApplyResult::applied(core, "outputTokensIncludeThinking"))
}

pub fn set_models_official_aliases(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("modelsOfficialAliases", json!(enabled))?;
    core.config.write().models_official_aliases = enabled;
    kiro_core::anthropic::set_models_official_aliases(enabled);
    Ok(ApplyResult::applied(core, "modelsOfficialAliases"))
}

/// Prompt cache 断点记账需要把 `BreakpointCache` 注入代理 AppState，
/// 因此只能通过重建代理运行时生效。
pub fn set_prompt_cache_accounting(core: &Core, enabled: bool) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("promptCacheAccounting", json!(enabled))?;
    core.config.write().prompt_cache_accounting = enabled;
    Ok(ApplyResult::needs_restart(
        core,
        vec!["promptCacheAccounting".to_string()],
    ))
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

/// 设置 effort 档位上限（`low`/`medium`/`high`/`xhigh`/`max`），热生效。
pub fn set_max_effort(core: &Core, value: &str) -> Result<ApplyResult, IpcError> {
    let cap = kiro_core::anthropic::EffortCap::parse(value)
        .ok_or_else(|| IpcError::new("invalid_input", format!("未知的 effort 档位: {value}")))?;
    let normalized = cap.as_str().to_string();
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("maxEffort", json!(normalized))?;
    core.config.write().max_effort = normalized;
    kiro_core::anthropic::set_max_effort(cap);
    Ok(ApplyResult::applied(core, "maxEffort"))
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

/// 负载均衡模式：运行时由 token 管理器热切换（嵌入模式下它不写 config.json），
/// 持久化统一走 ConfigStore，避免两个写入方互相覆盖 config.json
pub fn set_load_balancing_mode(core: &Core, mode: String) -> Result<ApplyResult, IpcError> {
    if mode != "priority" && mode != "balanced" {
        return Err(IpcError::new(
            "invalid_request",
            "mode 必须是 priority 或 balanced",
        ));
    }
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("loadBalancingMode", json!(&mode))?;
    core.admin()
        .set_load_balancing_mode(SetLoadBalancingModeRequest { mode: mode.clone() })
        .map_err(IpcError::internal)?;
    core.config.write().load_balancing_mode = mode;
    Ok(ApplyResult::applied(core, "loadBalancingMode"))
}

pub fn set_max_rpm_per_credential(core: &Core, value: u32) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    core.config_store
        .update_field("maxRpmPerCredential", json!(value))?;
    core.admin().set_max_rpm_per_credential(value);
    core.config.write().max_rpm_per_credential = value;
    Ok(ApplyResult::applied(core, "maxRpmPerCredential"))
}

/// 监听地址必须是 IP 字面量或 `localhost`
pub(crate) fn validate_host(host: &str) -> Result<(), IpcError> {
    if host == "localhost" || host.parse::<std::net::IpAddr>().is_ok() {
        return Ok(());
    }
    Err(IpcError::new(
        "invalid_host",
        format!("监听地址无效：{host}（应为 IP 地址，如 127.0.0.1 / 0.0.0.0 / ::1，或 localhost）"),
    ))
}

/// 用 kiro-core 的 Client 构建流程校验代理（含认证信息），与运行时实际生效的逻辑一致
pub(crate) fn validate_proxy(
    url: &str,
    username: Option<&str>,
    password: Option<&str>,
    tls_backend: TlsBackend,
) -> Result<(), IpcError> {
    let mut proxy = kiro_core::http_client::ProxyConfig::new(url);
    if let (Some(u), Some(p)) = (username, password) {
        proxy = proxy.with_auth(u, p);
    }
    kiro_core::http_client::build_client(Some(&proxy), 10, tls_backend)
        .map(|_| ())
        .map_err(|e| IpcError::new("invalid_proxy", format!("代理地址无效：{e}")))
}

/// 运行时配置补丁的校验结果
pub(crate) struct RuntimeConfigPlan {
    /// 合并补丁后的新配置
    pub next: Config,
    /// 需写入 config.json 的字段（一次性写入）
    pub fields: Vec<(&'static str, serde_json::Value)>,
    /// 需重启代理才生效的字段
    pub restart_required: Vec<String>,
}

/// 把补丁合并到配置副本上。
///
/// 纯函数：先校验全部字段，任一字段无效即返回错误，调用方据此保证「全部写入或全部不写」。
pub(crate) fn plan_runtime_config(
    current: &Config,
    patch: RuntimeConfigPatch,
) -> Result<RuntimeConfigPlan, IpcError> {
    let mut next = current.clone();
    let mut fields: Vec<(&'static str, serde_json::Value)> = Vec::new();
    let proxy_touched = patch.proxy_url.is_some()
        || patch.proxy_username.is_some()
        || patch.proxy_password.is_some()
        || patch.tls_backend.is_some();

    if let Some(host) = patch.host {
        let host = host.trim().to_string();
        validate_host(&host)?;
        fields.push(("host", json!(&host)));
        next.host = host;
    }
    if let Some(port) = patch.port {
        if port == 0 {
            return Err(IpcError::new("invalid_port", "监听端口必须在 1-65535 之间"));
        }
        fields.push(("port", json!(port)));
        next.port = port;
    }
    if let Some(proxy_url) = patch.proxy_url {
        let value = normalize_optional(proxy_url);
        fields.push(("proxyUrl", json!(&value)));
        next.proxy_url = value;
    }
    if let Some(proxy_username) = patch.proxy_username {
        let value = normalize_optional(proxy_username);
        fields.push(("proxyUsername", json!(&value)));
        next.proxy_username = value;
    }
    if let Some(proxy_password) = patch.proxy_password {
        let value = normalize_optional(proxy_password);
        fields.push(("proxyPassword", json!(&value)));
        next.proxy_password = value;
    }
    if let Some(tls_backend) = patch.tls_backend {
        next.tls_backend = match tls_backend.as_str() {
            "rustls" => TlsBackend::Rustls,
            "native-tls" => TlsBackend::NativeTls,
            _ => {
                return Err(IpcError::new(
                    "invalid_request",
                    "tlsBackend 必须是 rustls 或 native-tls",
                ));
            }
        };
        fields.push(("tlsBackend", json!(&tls_backend)));
    }
    if let Some(region) = patch.region {
        let region = region.trim().to_string();
        if region.is_empty() {
            return Err(IpcError::new("invalid_request", "region 不能为空"));
        }
        fields.push(("region", json!(&region)));
        next.region = region;
    }
    if let Some(auth_region) = patch.auth_region {
        let value = normalize_optional(auth_region);
        fields.push(("authRegion", json!(&value)));
        next.auth_region = value;
    }
    if let Some(api_region) = patch.api_region {
        let value = normalize_optional(api_region);
        fields.push(("apiRegion", json!(&value)));
        next.api_region = value;
    }

    // 代理按「合并后的最终值」校验：只改用户名/密码/TLS 时也要确认组合后的代理可用
    if proxy_touched && let Some(url) = &next.proxy_url {
        validate_proxy(
            url,
            next.proxy_username.as_deref(),
            next.proxy_password.as_deref(),
            next.tls_backend,
        )?;
    }

    let restart_required = fields.iter().map(|(key, _)| key.to_string()).collect();
    Ok(RuntimeConfigPlan {
        next,
        fields,
        restart_required,
    })
}

/// 应用需要重建代理运行时才能生效的字段。
///
/// 先校验全部字段（任一无效即返回 invalid_host / invalid_port / invalid_proxy，不写任何内容），
/// 再一次性写入 config.json 并同步内存配置。调用方在 `restart_required` 非空时重启代理，
/// 监听地址、代理、TLS 与区域才会真正生效。
pub fn set_runtime_config(core: &Core, patch: RuntimeConfigPatch) -> Result<ApplyResult, IpcError> {
    let _guard = core.persist_lock.lock();
    let current = core.config.read().clone();
    let plan = plan_runtime_config(&current, patch)?;
    core.config_store.update_fields(&plan.fields)?;
    *core.config.write() = plan.next;
    Ok(ApplyResult::needs_restart(core, plan.restart_required))
}

/// 启动时把配置文件中的进程级开关应用到运行时。
pub fn apply_runtime_flags(config: &Config) {
    kiro_core::anthropic::set_client_token_passthrough(config.client_token_passthrough);
    kiro_core::anthropic::set_thinking_as_text(config.thinking_as_text);
    kiro_core::anthropic::set_output_tokens_include_thinking(config.output_tokens_include_thinking);
    kiro_core::anthropic::set_models_official_aliases(config.models_official_aliases);
    kiro_core::anthropic::set_write_chunking_max_lines(config.write_chunking_max_lines);
    if let Some(cap) = kiro_core::anthropic::EffortCap::parse(&config.max_effort) {
        kiro_core::anthropic::set_max_effort(cap);
    }
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
    use crate::state::test_support::test_state;

    fn raw_config(core: &Core) -> String {
        std::fs::read_to_string(core.paths.config()).unwrap()
    }

    // MultiTokenManager::new 会调用 block_in_place 写入账号 ID 计数器，
    // 该 API 要求 multi-thread runtime。
    #[tokio::test(flavor = "multi_thread")]
    async fn toggling_suggestion_mode_persists_and_updates_switch() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        set_suggestion_mode(&core, true).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&raw_config(&core)).unwrap();
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
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        let result = set_runtime_config(
            &core,
            RuntimeConfigPatch {
                port: Some(6000),
                host: Some("0.0.0.0".into()),
                proxy_url: Some("socks5://127.0.0.1:1080".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(result.restart_required.contains(&"port".to_string()));
        assert!(result.restart_required.contains(&"host".to_string()));
        assert!(result.restart_required.contains(&"proxyUrl".to_string()));
        assert_eq!(core.config.read().port, 6000);
        let raw: serde_json::Value = serde_json::from_str(&raw_config(&core)).unwrap();
        assert_eq!(raw["port"], 6000);
        assert_eq!(raw["host"], "0.0.0.0");
        assert_eq!(raw["proxyUrl"], "socks5://127.0.0.1:1080");
    }

    /// 任一字段无效：返回对应错误码，config.json 与内存配置都保持不变
    fn assert_rejected(patch: RuntimeConfigPatch, code: &str) {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        let before_file = raw_config(&core);
        let before_port = core.config.read().port;
        let err = set_runtime_config(&core, patch).unwrap_err();
        assert_eq!(err.code, code, "{}", err.message);
        assert_eq!(raw_config(&core), before_file, "失败时不得写入任何字段");
        assert_eq!(core.config.read().port, before_port);
        assert!(core.config.read().proxy_url.is_none());
    }

    #[test]
    fn runtime_config_rejects_invalid_host_without_persisting() {
        assert_rejected(
            RuntimeConfigPatch {
                // 有效字段在前：确认不是「逐字段写入」
                port: Some(6100),
                host: Some("my-host.local".into()),
                ..Default::default()
            },
            "invalid_host",
        );
    }

    #[test]
    fn runtime_config_rejects_zero_port_without_persisting() {
        assert_rejected(
            RuntimeConfigPatch {
                host: Some("127.0.0.1".into()),
                port: Some(0),
                ..Default::default()
            },
            "invalid_port",
        );
    }

    #[test]
    fn runtime_config_rejects_invalid_proxy_without_persisting() {
        assert_rejected(
            RuntimeConfigPatch {
                port: Some(6200),
                proxy_url: Some("ftp://127.0.0.1:21".into()),
                ..Default::default()
            },
            "invalid_proxy",
        );
    }

    #[test]
    fn validate_host_accepts_ip_and_localhost_only() {
        for host in ["127.0.0.1", "0.0.0.0", "::1", "::", "localhost"] {
            assert!(validate_host(host).is_ok(), "{host}");
        }
        for host in ["", "LOCALHOST", "example.com", "127.0.0.1:80", "[::1]"] {
            assert_eq!(
                validate_host(host).unwrap_err().code,
                "invalid_host",
                "{host}"
            );
        }
    }

    #[test]
    fn empty_proxy_url_clears_proxy() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        set_runtime_config(
            &core,
            RuntimeConfigPatch {
                proxy_url: Some("http://127.0.0.1:7890".into()),
                proxy_username: Some("user".into()),
                proxy_password: Some(" secret ".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert_eq!(core.config.read().proxy_password.as_deref(), Some("secret"));
        set_runtime_config(
            &core,
            RuntimeConfigPatch {
                proxy_url: Some("  ".into()),
                ..Default::default()
            },
        )
        .unwrap();
        assert!(core.config.read().proxy_url.is_none());
        let raw: serde_json::Value = serde_json::from_str(&raw_config(&core)).unwrap();
        assert!(raw["proxyUrl"].is_null());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn load_balancing_mode_persists_through_config_store() {
        let (_dir, state) = test_state();
        let core = state.core().unwrap();
        set_load_balancing_mode(&core, "balanced".into()).unwrap();
        let raw: serde_json::Value = serde_json::from_str(&raw_config(&core)).unwrap();
        assert_eq!(raw["loadBalancingMode"], "balanced");
        // 其它字段（测试端口）原样保留
        assert_eq!(raw["port"], 0);
        assert_eq!(core.admin().get_load_balancing_mode().mode, "balanced");
        assert_eq!(
            set_load_balancing_mode(&core, "random".into())
                .unwrap_err()
                .code,
            "invalid_request"
        );
    }
}
