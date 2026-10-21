// Copyright (c) 2026 Harllan He. Licensed under MIT.

use tauri::{AppHandle, Emitter, Manager};

pub fn spawn_log_forwarder(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        loop {
            let receiver = {
                let state = app.state::<crate::state::AppState>();
                let Ok(core) = state.core() else {
                    tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    continue;
                };
                core.log_capture.subscribe()
            };
            let mut receiver = receiver;
            while let Ok(entry) = receiver.recv().await {
                let _ = app.emit("log://entry", &entry);
            }
        }
    });
}
