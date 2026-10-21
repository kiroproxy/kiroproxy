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
        ])
        .run(tauri::generate_context!())
        .expect("error while running KiroProxy");
}
