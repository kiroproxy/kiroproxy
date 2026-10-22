// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 设置命令：所有写入 config.json 的命令都是 async，并在阻塞线程池执行
//! （fsync 在 macOS 上是 F_FULLFSYNC，不能放在主线程）。

use crate::commands::blocking;
use crate::error::IpcError;
use crate::services::connection::{self, TestConnectionRequest, TestConnectionResult};
use crate::services::settings::{self, ApplyResult, RuntimeConfigPatch, SettingsView};
use crate::state::{AppState, Core};
use std::sync::Arc;

/// 在阻塞线程池中执行一个设置写入
async fn apply<F>(state: tauri::State<'_, AppState>, f: F) -> Result<ApplyResult, IpcError>
where
    F: FnOnce(&Core) -> Result<ApplyResult, IpcError> + Send + 'static,
{
    let core: Arc<Core> = state.core()?;
    blocking(move || f(&core)).await
}

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Result<SettingsView, IpcError> {
    let core = state.core()?;
    Ok(settings::settings_view(&core))
}

#[tauri::command]
pub async fn set_load_balancing_mode(
    state: tauri::State<'_, AppState>,
    mode: String,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_load_balancing_mode(core, mode)
    })
    .await
}

#[tauri::command]
pub async fn set_max_rpm_per_credential(
    state: tauri::State<'_, AppState>,
    value: u32,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_max_rpm_per_credential(core, value)
    })
    .await
}

#[tauri::command]
pub async fn set_suggestion_mode(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_suggestion_mode(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_client_token_passthrough(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_client_token_passthrough(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_thinking_as_text(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_thinking_as_text(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_output_tokens_include_thinking(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_output_tokens_include_thinking(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_models_official_aliases(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_models_official_aliases(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_prompt_cache_accounting(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_prompt_cache_accounting(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_debug_logs(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| settings::set_debug_logs(core, enabled)).await
}

#[tauri::command]
pub async fn set_dump_kiro_body(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_dump_kiro_body(core, enabled)
    })
    .await
}

#[tauri::command]
pub async fn set_write_chunking_max_lines(
    state: tauri::State<'_, AppState>,
    value: u32,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| {
        settings::set_write_chunking_max_lines(core, value)
    })
    .await
}

#[tauri::command]
pub async fn set_max_effort(
    state: tauri::State<'_, AppState>,
    value: String,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| settings::set_max_effort(core, &value)).await
}

#[tauri::command]
pub async fn set_runtime_config(
    state: tauri::State<'_, AppState>,
    patch: RuntimeConfigPatch,
) -> Result<ApplyResult, IpcError> {
    apply(state, move |core| settings::set_runtime_config(core, patch)).await
}

/// 测试网络连通性（代理字段缺省时沿用已保存的配置）
#[tauri::command]
pub async fn test_connection(
    state: tauri::State<'_, AppState>,
    req: TestConnectionRequest,
) -> Result<TestConnectionResult, IpcError> {
    let config = state.core()?.config.read().clone();
    connection::test_connection(&config, req).await
}
