// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 从本机 Kiro IDE 的 AWS SSO 缓存读取登录凭据。
//!
//! Kiro IDE 在 macOS / Linux 上把登录结果写到
//! `~/.aws/sso/cache/kiro-auth-token.json`（Windows 为 `%USERPROFILE%\.aws\sso\cache\...`）。
//! 本模块只读取该文件，不修改 Kiro IDE 的任何数据。

use serde::Deserialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone)]
pub struct KiroIdeAccount {
    pub refresh_token: String,
    pub profile_arn: Option<String>,
    pub expires_at: Option<String>,
    pub auth_method: Option<String>,
    pub provider: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawToken {
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    profile_arn: Option<String>,
    #[serde(default)]
    expires_at: Option<String>,
    #[serde(default)]
    auth_method: Option<String>,
    #[serde(default)]
    provider: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    client_secret: Option<String>,
}

/// Kiro IDE 默认登录缓存路径。
pub fn token_path() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".aws/sso/cache/kiro-auth-token.json"))
}

/// 扫描本机 Kiro IDE 登录信息；未登录或文件不存在时返回 `Ok(None)`。
pub fn scan() -> anyhow::Result<Option<KiroIdeAccount>> {
    let Some(path) = token_path() else {
        return Ok(None);
    };
    if !path.exists() {
        return Ok(None);
    }
    parse_file(&path).map(Some)
}

fn parse_file(path: &Path) -> anyhow::Result<KiroIdeAccount> {
    let content = std::fs::read_to_string(path)?;
    let raw: RawToken = serde_json::from_str(&content)?;
    let refresh_token = raw
        .refresh_token
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| anyhow::anyhow!("Kiro IDE 登录缓存缺少 refreshToken"))?;

    let auth_method = raw.auth_method.map(|value| value.to_ascii_lowercase());
    let mut client_id = raw.client_id;
    let mut client_secret = raw.client_secret;

    // IdC 账号的 clientId / clientSecret 可能单独存放在同目录的注册文件里。
    if auth_method.as_deref() == Some("idc")
        && (client_id.is_none() || client_secret.is_none())
        && let Some((id, secret)) = find_idc_client(path.parent())
    {
        client_id = client_id.or(Some(id));
        client_secret = client_secret.or(Some(secret));
    }

    Ok(KiroIdeAccount {
        refresh_token,
        profile_arn: raw.profile_arn,
        expires_at: raw.expires_at,
        auth_method,
        provider: raw.provider,
        client_id,
        client_secret,
        path: path.to_path_buf(),
    })
}

fn find_idc_client(dir: Option<&Path>) -> Option<(String, String)> {
    let dir = dir?;
    for entry in std::fs::read_dir(dir).ok()? {
        let Ok(entry) = entry else { continue };
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("json") {
            continue;
        }
        let Ok(content) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str::<serde_json::Value>(&content) else {
            continue;
        };
        let Some(client_id) = value
            .get("clientId")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        let Some(client_secret) = value
            .get("clientSecret")
            .and_then(serde_json::Value::as_str)
            .filter(|value| !value.is_empty())
        else {
            continue;
        };
        return Some((client_id.to_string(), client_secret.to_string()));
    }
    None
}

/// 预览用掩码：保留前 8 位。
pub fn mask_token(token: &str) -> String {
    format!("{}***", token.chars().take(8).collect::<String>())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_social_kiro_token() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kiro-auth-token.json");
        std::fs::write(
            &path,
            r#"{
              "accessToken": "access",
              "refreshToken": "refresh-token-123456",
              "profileArn": "arn:aws:codewhisperer:us-east-1:1:profile/x",
              "expiresAt": "2026-10-21T12:18:23.279Z",
              "authMethod": "social",
              "provider": "Google"
            }"#,
        )
        .unwrap();

        let account = parse_file(&path).unwrap();
        assert_eq!(account.refresh_token, "refresh-token-123456");
        assert_eq!(account.auth_method.as_deref(), Some("social"));
        assert_eq!(account.provider.as_deref(), Some("Google"));
        assert_eq!(
            account.profile_arn.as_deref(),
            Some("arn:aws:codewhisperer:us-east-1:1:profile/x")
        );
        assert_eq!(mask_token(&account.refresh_token), "refresh-***");
    }

    #[test]
    fn rejects_token_without_refresh_token() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("kiro-auth-token.json");
        std::fs::write(&path, r#"{"accessToken":"access"}"#).unwrap();
        assert!(parse_file(&path).is_err());
    }
}
