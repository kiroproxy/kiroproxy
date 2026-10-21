// Copyright (c) 2026 Harllan He. Licensed under MIT.

// 复制自上游的测试模块大量使用 Default::default() 后逐字段赋值，
// 且模块名与父模块同名；这些 lint 不影响运行时行为，统一在 crate 级别允许。
#![allow(clippy::field_reassign_with_default, clippy::module_inception)]

pub mod admin;
pub mod anthropic;
pub mod app_logging;
pub mod cache;
pub mod common;
pub mod config_store;
pub mod http_client;
pub mod kam;
pub mod kiro;
pub mod kiro_ide;
pub mod log_capture;
pub mod logging;
pub mod model;
pub mod openai;
pub mod paths;
pub mod runtime;
pub mod stores;
pub mod token;
