// Copyright (c) 2026 Harllan He. Licensed under MIT.

mod commands;
mod error;
mod events;
mod services;
mod state;

use crate::error::IpcError;
use crate::state::AppState;
use kiro_core::paths::AppPaths;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            use tauri::Manager;
            let root = app.path().app_data_dir()?;
            let paths = AppPaths::new(root)?;
            let state = match AppState::try_new(paths.clone()) {
                Ok(state) => state,
                Err(e) => AppState::failed(paths, IpcError::internal(e)),
            };
            app.manage(state);
            events::spawn_log_forwarder(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::app::get_startup_error,
            commands::app::get_server_status,
            commands::app::start_proxy_server,
            commands::app::stop_proxy_server,
            commands::app::retry_startup,
            commands::app::restart_proxy_server,
            commands::app::open_data_dir,
            commands::app::open_file,
            commands::app::read_text_file,
            commands::app::clear_logs,
            commands::app::quit_app,
            // 账号
            commands::accounts::list_accounts,
            commands::accounts::add_account,
            commands::accounts::update_account,
            commands::accounts::delete_account,
            commands::accounts::set_account_disabled,
            commands::accounts::set_account_priority,
            commands::accounts::reset_account_failure,
            commands::accounts::get_account_balance,
            commands::accounts::preview_kam_import,
            commands::accounts::import_kam_accounts,
            commands::accounts::verify_accounts,
            commands::accounts::cancel_verify_accounts,
            commands::kiro_ide::scan_kiro_ide,
            commands::kiro_ide::import_kiro_ide,
            // 设置
            commands::settings::get_settings,
            commands::settings::set_load_balancing_mode,
            commands::settings::set_max_rpm_per_credential,
            commands::settings::set_suggestion_mode,
            commands::settings::set_client_token_passthrough,
            commands::settings::set_thinking_as_text,
            commands::settings::set_debug_logs,
            commands::settings::set_dump_kiro_body,
            commands::settings::set_write_chunking_max_lines,
            commands::settings::set_runtime_config,
            // 日志
            commands::logs::get_log_snapshot,
            commands::logs::get_throttle_logs,
            commands::logs::get_failure_logs,
            commands::logs::export_logs,
            // 模型
            commands::models::list_models,
            commands::models::get_account_models,
            // 用量
            commands::usage::get_daily_usage,
            commands::usage::get_daily_usage_records,
            commands::usage::get_usage_records,
            commands::usage::get_credential_usage_records,
            commands::usage::get_credential_today_summary,
            commands::usage::get_rpm,
            // API Key
            commands::api_keys::list_api_keys,
            commands::api_keys::get_api_key_secret,
            commands::api_keys::create_api_key,
            commands::api_keys::update_api_key,
            commands::api_keys::delete_api_key,
            commands::api_keys::get_all_api_key_usage,
            commands::api_keys::get_api_key_usage,
            commands::api_keys::get_api_key_usage_records,
            commands::api_keys::reset_api_key_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running KiroProxy");
}
