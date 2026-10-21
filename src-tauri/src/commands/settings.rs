// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::error::IpcError;
use crate::services::settings::{self, ApplyResult, RuntimeConfigPatch, SettingsView};
use crate::state::AppState;

#[tauri::command]
pub fn get_settings(state: tauri::State<'_, AppState>) -> Result<SettingsView, IpcError> {
    let core = state.core()?;
    Ok(settings::settings_view(&core))
}

#[tauri::command]
pub fn set_load_balancing_mode(
    state: tauri::State<'_, AppState>,
    mode: String,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_load_balancing_mode(&core, mode)
}

#[tauri::command]
pub fn set_max_rpm_per_credential(
    state: tauri::State<'_, AppState>,
    value: u32,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_max_rpm_per_credential(&core, value)
}

#[tauri::command]
pub fn set_suggestion_mode(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_suggestion_mode(&core, enabled)
}

#[tauri::command]
pub fn set_client_token_passthrough(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_client_token_passthrough(&core, enabled)
}

#[tauri::command]
pub fn set_thinking_as_text(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_thinking_as_text(&core, enabled)
}

#[tauri::command]
pub fn set_output_tokens_include_thinking(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_output_tokens_include_thinking(&core, enabled)
}

#[tauri::command]
pub fn set_models_official_aliases(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_models_official_aliases(&core, enabled)
}

#[tauri::command]
pub fn set_prompt_cache_accounting(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_prompt_cache_accounting(&core, enabled)
}

#[tauri::command]
pub fn set_debug_logs(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_debug_logs(&core, enabled)
}

#[tauri::command]
pub fn set_dump_kiro_body(
    state: tauri::State<'_, AppState>,
    enabled: bool,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_dump_kiro_body(&core, enabled)
}

#[tauri::command]
pub fn set_write_chunking_max_lines(
    state: tauri::State<'_, AppState>,
    value: u32,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_write_chunking_max_lines(&core, value)
}

#[tauri::command]
pub fn set_runtime_config(
    state: tauri::State<'_, AppState>,
    patch: RuntimeConfigPatch,
) -> Result<ApplyResult, IpcError> {
    let core = state.core()?;
    settings::set_runtime_config(&core, patch)
}
