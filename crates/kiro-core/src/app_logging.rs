// Copyright (c) 2026 Harllan He. Licensed under MIT.

use crate::log_capture::LogCapture;
use crate::logging;
use crate::model::config::Config;
use crate::paths::AppPaths;
use std::sync::{Arc, OnceLock};
use tracing_subscriber::prelude::*;

static CAPTURE: OnceLock<Arc<LogCapture>> = OnceLock::new();

pub fn init(config: &Config, paths: &AppPaths) -> anyhow::Result<Arc<LogCapture>> {
    if let Some(capture) = CAPTURE.get() {
        return Ok(capture.clone());
    }

    rotate_if_needed(&paths.log_file(), 10 * 1024 * 1024)?;
    let log_capture = Arc::new(LogCapture::new(1000));
    let (filter, handle) = logging::new_reload_layer(config.debug_logs);
    logging::install(handle);

    let file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(paths.log_file())?;

    tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::fmt::layer().with_writer(Arc::new(file)))
        .with(log_capture.as_layer())
        .init();

    let _ = CAPTURE.set(log_capture.clone());
    Ok(log_capture)
}

fn rotate_if_needed(path: &std::path::Path, max: u64) -> std::io::Result<()> {
    let Ok(meta) = std::fs::metadata(path) else {
        return Ok(());
    };
    if meta.len() <= max {
        return Ok(());
    }
    let backup = path.with_extension("log.1");
    let _ = std::fs::remove_file(&backup);
    std::fs::rename(path, backup)
}
