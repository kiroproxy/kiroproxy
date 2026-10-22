// Copyright (c) 2026 pigcursor. Licensed under MIT.

use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;

#[derive(Debug, Clone, Default)]
pub struct KamImport {
    pub accounts: Vec<KamAccount>,
    pub duplicates_in_file: usize,
    pub invalid: usize,
}

#[derive(Debug, Clone, Default)]
pub struct KamAccount {
    pub refresh_token: String,
    pub email: Option<String>,
    pub nickname: Option<String>,
    pub provider: Option<String>,
    pub auth_method: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub profile_arn: Option<String>,
    pub auth_region: Option<String>,
}

pub fn parse(input: &str) -> anyhow::Result<KamImport> {
    let value: Value = serde_json::from_str(input)?;
    let raw = if let Some(accounts) = value.get("accounts").and_then(Value::as_array) {
        accounts.clone()
    } else if let Some(array) = value.as_array() {
        array.clone()
    } else {
        vec![value]
    };

    let mut out = KamImport::default();
    let mut seen = HashSet::new();
    for item in raw {
        let Some(token) = item
            .pointer("/credentials/refreshToken")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|s| !s.is_empty())
        else {
            out.invalid += 1;
            continue;
        };
        let digest = hex::encode(Sha256::digest(token.as_bytes()));
        if !seen.insert(digest) {
            out.duplicates_in_file += 1;
            continue;
        }
        let creds = item.get("credentials");
        out.accounts.push(KamAccount {
            refresh_token: token.to_string(),
            email: item
                .get("email")
                .and_then(Value::as_str)
                .map(str::to_string),
            nickname: item
                .get("nickname")
                .and_then(Value::as_str)
                .map(str::to_string),
            provider: normalize_provider(
                creds
                    .and_then(|c| c.get("provider"))
                    .and_then(Value::as_str)
                    .or_else(|| item.get("idp").and_then(Value::as_str)),
            ),
            auth_method: creds
                .and_then(|c| c.get("authMethod"))
                .and_then(Value::as_str)
                .map(str::to_string),
            client_id: creds
                .and_then(|c| c.get("clientId"))
                .and_then(Value::as_str)
                .map(str::to_string),
            client_secret: creds
                .and_then(|c| c.get("clientSecret"))
                .and_then(Value::as_str)
                .map(str::to_string),
            profile_arn: creds
                .and_then(|c| c.get("profileArn"))
                .and_then(Value::as_str)
                .map(str::to_string),
            auth_region: creds
                .and_then(|c| c.get("region"))
                .and_then(Value::as_str)
                .map(str::to_string),
        });
    }
    Ok(out)
}

fn normalize_provider(raw: Option<&str>) -> Option<String> {
    match raw?.trim().to_ascii_lowercase().as_str() {
        "google" => Some("Google".into()),
        "github" => Some("GitHub".into()),
        "enterprise" => Some("Enterprise".into()),
        _ => None,
    }
}

pub fn refresh_token_hash(token: &str) -> String {
    hex::encode(Sha256::digest(token.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_kam_export_and_normalizes_provider() {
        let json = r#"{
          "version": "1.7.5",
          "accounts": [{
            "email": "a@example.com",
            "nickname": "A",
            "idp": "google",
            "credentials": {
              "refreshToken": "rt-1",
              "region": "us-west-2",
              "authMethod": "social",
              "provider": "Google"
            }
          }]
        }"#;
        let parsed = parse(json).unwrap();
        assert_eq!(parsed.accounts.len(), 1);
        assert_eq!(parsed.accounts[0].email.as_deref(), Some("a@example.com"));
        assert_eq!(parsed.accounts[0].provider.as_deref(), Some("Google"));
        assert_eq!(parsed.accounts[0].auth_region.as_deref(), Some("us-west-2"));
        assert_eq!(parsed.accounts[0].auth_method.as_deref(), Some("social"));
    }

    #[test]
    fn skips_accounts_without_refresh_token_and_duplicates() {
        let json = r#"[
          {"credentials":{"refreshToken":"same"}},
          {"credentials":{"refreshToken":"same"}},
          {"credentials":{}}
        ]"#;
        let parsed = parse(json).unwrap();
        assert_eq!(parsed.accounts.len(), 1);
        assert_eq!(parsed.duplicates_in_file, 1);
        assert_eq!(parsed.invalid, 1);
    }
}
