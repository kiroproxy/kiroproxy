// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 网络连通性测试：用与代理运行时相同的 Client 构建流程（代理 / TLS 后端）请求一次 Kiro 上游。

use crate::error::IpcError;
use kiro_core::http_client::{ProxyConfig, build_client};
use kiro_core::kiro::endpoint::{Endpoint, EndpointName};
use kiro_core::model::config::{Config, TlsBackend};
use serde::{Deserialize, Serialize};
use std::time::{Duration, Instant};

/// 单次测试超时
const TEST_TIMEOUT: Duration = Duration::from_secs(10);

/// 每个字段：缺省（None）沿用已保存的配置；空字符串表示不使用（直连 / 无认证）；其它值覆盖
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionRequest {
    #[serde(default)]
    pub proxy_url: Option<String>,
    #[serde(default)]
    pub proxy_username: Option<String>,
    #[serde(default)]
    pub proxy_password: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TestConnectionResult {
    /// 收到任何 HTTP 响应（含 4xx/5xx）即视为网络通路正常
    pub ok: bool,
    pub latency_ms: u64,
    pub status: Option<u16>,
    pub target: String,
    pub message: String,
}

/// 合并请求与已保存配置得到实际使用的代理（None = 直连）
pub(crate) fn effective_proxy(config: &Config, req: &TestConnectionRequest) -> Option<ProxyConfig> {
    // 与 set_runtime_config 保存时的归一化一致：去首尾空白，空串表示不使用
    fn pick(requested: &Option<String>, saved: &Option<String>) -> Option<String> {
        match requested {
            None => saved.clone(),
            Some(value) => {
                let value = value.trim();
                (!value.is_empty()).then(|| value.to_string())
            }
        }
    }
    let url = pick(&req.proxy_url, &config.proxy_url)?;
    let username = pick(&req.proxy_username, &config.proxy_username);
    let password = pick(&req.proxy_password, &config.proxy_password);
    let mut proxy = ProxyConfig::new(url);
    if let (Some(u), Some(p)) = (username, password) {
        proxy = proxy.with_auth(u, p);
    }
    Some(proxy)
}

/// 测试目标：代理运行时默认使用的 Kiro API 端点（`q.{apiRegion}.amazonaws.com`）
pub(crate) fn target_url(config: &Config) -> String {
    let host = Endpoint::by_name(EndpointName::Ide, config.effective_api_region()).host;
    format!("https://{host}/")
}

/// 把 reqwest 错误翻译成可读的中文提示（只用于展示，不含代理认证信息）
fn describe_error(e: &reqwest::Error, via_proxy: bool) -> String {
    use std::error::Error as _;
    let mut chain = Vec::new();
    let mut source = e.source();
    while let Some(err) = source {
        chain.push(err.to_string());
        source = err.source();
    }
    let detail = chain.last().cloned().unwrap_or_else(|| e.to_string());
    let lower = chain.join(" | ").to_lowercase();
    let reason = if e.is_timeout() {
        format!("连接超时（{} 秒内无响应）", TEST_TIMEOUT.as_secs())
    } else if lower.contains("certificate") || lower.contains("tls") || lower.contains("handshake")
    {
        "TLS 握手失败，可能被中间人代理拦截或证书不受信任".to_string()
    } else if lower.contains("dns")
        || lower.contains("failed to lookup")
        || lower.contains("resolve")
    {
        "域名解析失败，请检查网络或 DNS 设置".to_string()
    } else if via_proxy && (lower.contains("proxy") || lower.contains("socks") || e.is_connect()) {
        "无法通过代理建立连接，请检查代理地址、端口与认证信息".to_string()
    } else if lower.contains("refused") {
        "连接被拒绝".to_string()
    } else if e.is_connect() {
        "无法建立连接，请检查网络".to_string()
    } else {
        "请求失败".to_string()
    };
    format!("{reason}：{detail}")
}

pub async fn test_connection(
    config: &Config,
    req: TestConnectionRequest,
) -> Result<TestConnectionResult, IpcError> {
    test_connection_to(config, req, &target_url(config)).await
}

pub(crate) async fn test_connection_to(
    config: &Config,
    req: TestConnectionRequest,
    target: &str,
) -> Result<TestConnectionResult, IpcError> {
    let proxy = effective_proxy(config, &req);
    let tls_backend: TlsBackend = config.tls_backend;
    let client = build_client(proxy.as_ref(), TEST_TIMEOUT.as_secs(), tls_backend)
        .map_err(|e| IpcError::new("invalid_proxy", format!("代理地址无效：{e}")))?;
    let route = if proxy.is_some() {
        "经代理"
    } else {
        "直连"
    };

    let started = Instant::now();
    let response = client
        .get(target)
        .header("Connection", "close")
        .send()
        .await;
    let latency_ms = started.elapsed().as_millis() as u64;

    Ok(match response {
        Ok(resp) => {
            let status = resp.status().as_u16();
            TestConnectionResult {
                ok: true,
                latency_ms,
                status: Some(status),
                target: target.to_string(),
                message: format!("{route}连接成功，上游返回 HTTP {status}，耗时 {latency_ms} ms"),
            }
        }
        Err(e) => TestConnectionResult {
            ok: false,
            latency_ms,
            status: None,
            target: target.to_string(),
            message: format!("{route}连接失败：{}", describe_error(&e, proxy.is_some())),
        },
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn saved_config() -> Config {
        let mut config = Config::default();
        config.proxy_url = Some("http://127.0.0.1:7890".into());
        config.proxy_username = Some("saved-user".into());
        config.proxy_password = Some("saved-pass".into());
        config
    }

    #[test]
    fn none_fields_use_saved_config() {
        let proxy = effective_proxy(&saved_config(), &TestConnectionRequest::default()).unwrap();
        assert_eq!(proxy.url, "http://127.0.0.1:7890");
        assert_eq!(proxy.username.as_deref(), Some("saved-user"));
        assert_eq!(proxy.password.as_deref(), Some("saved-pass"));
    }

    #[test]
    fn empty_proxy_url_means_direct() {
        let req = TestConnectionRequest {
            proxy_url: Some(String::new()),
            ..Default::default()
        };
        assert!(effective_proxy(&saved_config(), &req).is_none());
    }

    #[test]
    fn empty_username_disables_auth_and_values_override() {
        let req = TestConnectionRequest {
            proxy_url: Some(" socks5://10.0.0.1:1080 ".into()),
            proxy_username: Some(String::new()),
            proxy_password: None,
        };
        let proxy = effective_proxy(&saved_config(), &req).unwrap();
        assert_eq!(proxy.url, "socks5://10.0.0.1:1080");
        assert!(proxy.username.is_none());
        assert!(proxy.password.is_none());
    }

    #[test]
    fn target_uses_kiro_api_host_for_region() {
        let mut config = Config::default();
        config.region = "eu-central-1".into();
        assert_eq!(target_url(&config), "https://q.eu-central-1.amazonaws.com/");
        config.api_region = Some("us-east-1".into());
        assert_eq!(target_url(&config), "https://q.us-east-1.amazonaws.com/");
    }

    #[test]
    fn request_deserializes_camel_case() {
        let req: TestConnectionRequest =
            serde_json::from_str(r#"{"proxyUrl":"","proxyPassword":"p"}"#).unwrap();
        assert_eq!(req.proxy_url.as_deref(), Some(""));
        assert!(req.proxy_username.is_none());
        assert_eq!(req.proxy_password.as_deref(), Some("p"));
    }

    #[tokio::test]
    async fn invalid_proxy_returns_ipc_error() {
        let req = TestConnectionRequest {
            proxy_url: Some("ftp://127.0.0.1:21".into()),
            ..Default::default()
        };
        let err = test_connection_to(&Config::default(), req, "http://127.0.0.1:9/")
            .await
            .unwrap_err();
        assert_eq!(err.code, "invalid_proxy");
    }

    #[tokio::test]
    async fn http_error_status_still_counts_as_reachable() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            let _ = socket
                .write_all(
                    b"HTTP/1.1 403 Forbidden\r\ncontent-length: 0\r\nconnection: close\r\n\r\n",
                )
                .await;
        });
        let req = TestConnectionRequest {
            proxy_url: Some(String::new()),
            ..Default::default()
        };
        let result = test_connection_to(&Config::default(), req, &format!("http://{addr}/"))
            .await
            .unwrap();
        assert!(result.ok);
        assert_eq!(result.status, Some(403));
        let json = serde_json::to_value(&result).unwrap();
        assert!(json["latencyMs"].is_number());
        assert_eq!(json["target"], format!("http://{addr}/"));
    }

    #[tokio::test]
    async fn network_failure_is_ok_false_not_error() {
        // 先绑定再释放，得到一个当前无人监听的本地端口
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .unwrap()
            .local_addr()
            .unwrap()
            .port();
        let req = TestConnectionRequest {
            proxy_url: Some(String::new()),
            ..Default::default()
        };
        let result = test_connection_to(
            &Config::default(),
            req,
            &format!("http://127.0.0.1:{port}/"),
        )
        .await
        .unwrap();
        assert!(!result.ok);
        assert!(result.status.is_none());
        assert!(
            result.message.contains("直连连接失败"),
            "{}",
            result.message
        );
    }
}
