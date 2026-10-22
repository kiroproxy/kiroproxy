// Copyright (c) 2026 pigcursor. Licensed under MIT.

mod commands;
mod error;
mod events;
mod services;
mod state;

use crate::state::{AppState, startup_error};
use kiro_core::paths::AppPaths;
use std::time::Duration;

/// 退出时等待代理服务优雅关闭的上限（在途请求超时后不再等待）
const EXIT_SHUTDOWN_TIMEOUT: Duration = Duration::from_secs(3);

pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            use tauri::Manager;
            // KIROPROXY_DATA_DIR：隔离的开发/测试数据目录，不影响正在使用的正式数据
            let root = match state::data_dir_override() {
                Some(dir) => dir,
                None => app.path().app_data_dir()?,
            };
            let paths = AppPaths::new(root)?;
            let state = match AppState::try_new(paths.clone()) {
                Ok(state) => state,
                Err(e) => {
                    let error = startup_error(&e);
                    eprintln!("KiroProxy 启动失败: {error}");
                    AppState::failed(paths, error)
                }
            };
            app.manage(state);
            app.manage(services::updater::UpdateState::new(
                app.package_info().version.to_string(),
            ));
            app.manage(services::oauth::OauthState::default());
            events::spawn_log_forwarder(app.handle().clone());
            services::updater::spawn_scheduler(app.handle().clone());
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
            commands::app::open_link,
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
            commands::oauth::get_oauth_status,
            commands::oauth::start_browser_login,
            commands::oauth::cancel_browser_login,
            commands::oauth::reopen_login_page,
            // 设置
            commands::settings::get_settings,
            commands::settings::set_load_balancing_mode,
            commands::settings::set_max_rpm_per_credential,
            commands::settings::set_suggestion_mode,
            commands::settings::set_client_token_passthrough,
            commands::settings::set_thinking_as_text,
            commands::settings::set_output_tokens_include_thinking,
            commands::settings::set_models_official_aliases,
            commands::settings::set_prompt_cache_accounting,
            commands::settings::set_debug_logs,
            commands::settings::set_dump_kiro_body,
            commands::settings::set_write_chunking_max_lines,
            commands::settings::set_max_effort,
            commands::settings::set_runtime_config,
            commands::settings::test_connection,
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
            commands::usage::get_usage_breakdown,
            commands::usage::get_credential_usage_records,
            commands::usage::get_credential_today_summary,
            commands::usage::get_rpm,
            // 软件更新
            commands::updater::get_update_status,
            commands::updater::check_for_update,
            commands::updater::install_update,
            commands::updater::open_update_page,
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
        .build(tauri::generate_context!())
        .expect("error while building KiroProxy");

    app.run(|handle, event| {
        if let tauri::RunEvent::Exit = event {
            prepare_exit(handle);
        }
    });
}

/// 退出清理：停止代理服务（等待在途请求最多 3 秒），再把所有防抖/周期写入的数据落盘。
/// 退出、以及安装更新后重启之前都会调用，重复调用是幂等的。
pub(crate) fn prepare_exit(handle: &tauri::AppHandle) {
    use tauri::Manager;
    let Some(state) = handle.try_state::<AppState>() else {
        return;
    };
    let Ok(core) = state.core() else {
        return;
    };
    services::server::shutdown_blocking(&core, EXIT_SHUTDOWN_TIMEOUT);
    core.flush_all();
    tracing::info!("KiroProxy 已退出，数据已落盘");
}
