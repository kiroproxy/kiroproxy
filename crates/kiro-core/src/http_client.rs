// Copyright (c) 2026 Harllan He. Licensed under MIT.
//! HTTP Client 构建模块
//!
//! 提供统一的 HTTP Client 构建功能，支持代理配置

use reqwest::{Client, Proxy};
use std::time::Duration;

use crate::model::config::TlsBackend;

/// 代理配置
#[derive(Debug, Clone, Default, PartialEq, Eq, Hash)]
pub struct ProxyConfig {
    /// 代理地址，支持 http/https/socks5
    pub url: String,
    /// 代理认证用户名
    pub username: Option<String>,
    /// 代理认证密码
    pub password: Option<String>,
}

impl ProxyConfig {
    /// 从 url 创建代理配置
    pub fn new(url: impl Into<String>) -> Self {
        Self {
            url: url.into(),
            username: None,
            password: None,
        }
    }

    /// 设置认证信息
    pub fn with_auth(mut self, username: impl Into<String>, password: impl Into<String>) -> Self {
        self.username = Some(username.into());
        self.password = Some(password.into());
        self
    }
}

/// 代理地址无效（启动/重建运行时据此给出明确的修复提示，而不是笼统的内部错误）
#[derive(Debug)]
pub struct InvalidProxyError(pub String);

impl std::fmt::Display for InvalidProxyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for InvalidProxyError {}

/// 受支持的代理协议（与 reqwest 的 socks / http 代理实现一致）
const SUPPORTED_PROXY_SCHEMES: [&str; 6] =
    ["http", "https", "socks4", "socks4a", "socks5", "socks5h"];

/// 解析代理地址；与 reqwest 一致，缺少协议前缀时按 `http://` 补全。
fn parse_proxy_url(url: &str) -> anyhow::Result<reqwest::Url> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        anyhow::bail!("代理地址为空");
    }
    // 没有 "://" 时（如 `127.0.0.1:7890`、`localhost:7890`）与 reqwest 一样补 http://
    let candidate = if trimmed.contains("://") {
        trimmed.to_string()
    } else {
        format!("http://{trimmed}")
    };
    let parsed =
        reqwest::Url::parse(&candidate).map_err(|e| anyhow::anyhow!("无法解析代理地址：{e}"))?;
    let scheme = parsed.scheme().to_ascii_lowercase();
    if !SUPPORTED_PROXY_SCHEMES.contains(&scheme.as_str()) {
        anyhow::bail!(
            "不支持的代理协议 {scheme}://，仅支持 http、https、socks4、socks4a、socks5、socks5h"
        );
    }
    if parsed.host_str().is_none_or(str::is_empty) {
        anyhow::bail!("代理地址缺少主机名");
    }
    Ok(parsed)
}

/// 校验代理地址格式（协议前缀 + 主机名）
///
/// reqwest 遇到未知协议的代理不会报错，而是静默直连；保存配置与构建 Client 前
/// 都必须显式拦截，避免用户以为流量走了代理。错误信息不包含原始地址（可能内嵌密码）。
pub fn validate_proxy_url(url: &str) -> anyhow::Result<()> {
    parse_proxy_url(url).map(|_| ())
}

/// 日志用的代理地址：去掉 userinfo，避免把内嵌的账号密码写进日志
fn redacted_proxy_url(url: &str) -> String {
    match parse_proxy_url(url) {
        Ok(parsed) => match parsed.port() {
            Some(port) => format!(
                "{}://{}:{}",
                parsed.scheme(),
                parsed.host_str().unwrap_or_default(),
                port
            ),
            None => format!(
                "{}://{}",
                parsed.scheme(),
                parsed.host_str().unwrap_or_default()
            ),
        },
        Err(_) => "<invalid>".to_string(),
    }
}

/// 构建 HTTP Client
///
/// # Arguments
/// * `proxy` - 可选的代理配置
/// * `timeout_secs` - 超时时间（秒）
///
/// # Returns
/// 配置好的 reqwest::Client；代理地址无效时返回错误（不会静默直连）
pub fn build_client(
    proxy: Option<&ProxyConfig>,
    timeout_secs: u64,
    tls_backend: TlsBackend,
) -> anyhow::Result<Client> {
    let mut builder = Client::builder()
        .timeout(Duration::from_secs(timeout_secs))
        .pool_max_idle_per_host(20)
        .pool_idle_timeout(Duration::from_secs(90))
        .tcp_keepalive(Duration::from_secs(30));

    if tls_backend == TlsBackend::Rustls {
        builder = builder.use_rustls_tls();
    }

    if let Some(proxy_config) = proxy {
        // 用校验过的规范化地址构建，保证「校验通过」与「实际生效」是同一个地址
        let url = parse_proxy_url(&proxy_config.url)?;
        let mut proxy =
            Proxy::all(url.as_str()).map_err(|e| anyhow::anyhow!("代理地址无效：{e}"))?;

        // 设置代理认证
        if let (Some(username), Some(password)) = (&proxy_config.username, &proxy_config.password) {
            proxy = proxy.basic_auth(username, password);
        }

        builder = builder.proxy(proxy);
        tracing::debug!(
            "HTTP Client 使用代理: {}",
            redacted_proxy_url(&proxy_config.url)
        );
    }

    builder
        .build()
        .map_err(|e| anyhow::anyhow!("创建 HTTP 客户端失败：{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_proxy_config_new() {
        let config = ProxyConfig::new("http://127.0.0.1:7890");
        assert_eq!(config.url, "http://127.0.0.1:7890");
        assert!(config.username.is_none());
        assert!(config.password.is_none());
    }

    #[test]
    fn test_proxy_config_with_auth() {
        let config = ProxyConfig::new("socks5://127.0.0.1:1080").with_auth("user", "pass");
        assert_eq!(config.url, "socks5://127.0.0.1:1080");
        assert_eq!(config.username, Some("user".to_string()));
        assert_eq!(config.password, Some("pass".to_string()));
    }

    #[test]
    fn test_build_client_without_proxy() {
        let client = build_client(None, 30, TlsBackend::Rustls);
        assert!(client.is_ok());
    }

    #[test]
    fn test_build_client_with_proxy() {
        let config = ProxyConfig::new("http://127.0.0.1:7890");
        let client = build_client(Some(&config), 30, TlsBackend::Rustls);
        assert!(client.is_ok());
    }

    #[test]
    fn test_validate_proxy_url_accepts_supported_schemes() {
        for url in [
            "http://127.0.0.1:7890",
            "https://proxy.example.com:443",
            "socks5://127.0.0.1:1080",
            "socks5h://user:pass@127.0.0.1:1080",
            // 与 reqwest 一致：缺少协议前缀按 http:// 处理
            "127.0.0.1:7890",
        ] {
            assert!(validate_proxy_url(url).is_ok(), "{url} 应校验通过");
        }
    }

    #[test]
    fn test_validate_proxy_url_rejects_invalid() {
        for url in ["", "   ", "ftp://127.0.0.1:21", "http://", "http://[::1"] {
            assert!(validate_proxy_url(url).is_err(), "{url:?} 应被拒绝");
        }
    }

    #[test]
    fn test_build_client_rejects_unknown_scheme_instead_of_direct() {
        // reqwest 对未知协议静默直连；build_client 必须报错
        let config = ProxyConfig::new("ftp://127.0.0.1:21");
        let err = build_client(Some(&config), 30, TlsBackend::Rustls).unwrap_err();
        assert!(err.to_string().contains("不支持的代理协议"), "{err}");
    }

    #[test]
    fn test_validate_error_does_not_leak_credentials() {
        let err = validate_proxy_url("gopher://user:secret@host:1").unwrap_err();
        assert!(!err.to_string().contains("secret"));
        assert_eq!(
            redacted_proxy_url("http://user:secret@127.0.0.1:7890"),
            "http://127.0.0.1:7890"
        );
    }
}
