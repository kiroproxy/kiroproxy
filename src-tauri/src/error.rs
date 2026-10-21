// Copyright (c) 2026 Harllan He. Licensed under MIT.

use serde::Serialize;
use std::fmt;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IpcError {
    pub code: String,
    pub message: String,
}

impl IpcError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
    pub fn internal(e: impl fmt::Display) -> Self {
        Self::new("internal_error", e.to_string())
    }
}

impl fmt::Display for IpcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for IpcError {}

impl From<anyhow::Error> for IpcError {
    fn from(e: anyhow::Error) -> Self {
        Self::internal(e)
    }
}

impl From<std::io::Error> for IpcError {
    fn from(e: std::io::Error) -> Self {
        Self::internal(e)
    }
}
