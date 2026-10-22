// Copyright (c) 2026 pigcursor. Licensed under MIT.

//! 应用日志装配：控制台 + 按大小轮转的日志文件 + 内存捕获层（供日志页实时展示）。

use crate::log_capture::LogCapture;
use crate::logging;
use crate::model::config::Config;
use crate::paths::AppPaths;
use parking_lot::Mutex;
use std::fs::File;
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{Arc, OnceLock};
use tracing_subscriber::prelude::*;

/// 单个日志文件上限：写入时检查，超过后轮转为 `proxy.log.1`（只保留一个备份）
pub const MAX_LOG_FILE_BYTES: u64 = 10 * 1024 * 1024;

static CAPTURE: OnceLock<Arc<LogCapture>> = OnceLock::new();
static FILE_WRITER: OnceLock<Arc<RotatingFile>> = OnceLock::new();
/// 串行化初始化：并发调用（如并行测试）会同时看到 CAPTURE 未设置，
/// 第二个调用随后安装全局 subscriber 时 panic。
static INIT_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

pub fn init(config: &Config, paths: &AppPaths) -> anyhow::Result<Arc<LogCapture>> {
    let _guard = INIT_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(capture) = CAPTURE.get() {
        return Ok(capture.clone());
    }

    let log_capture = Arc::new(LogCapture::new(1000));
    let file = Arc::new(RotatingFile::open(paths.log_file(), MAX_LOG_FILE_BYTES)?);
    let (filter, handle) = logging::new_reload_layer(config.debug_logs);
    logging::install(handle);

    let installed = tracing_subscriber::registry()
        .with(filter)
        .with(tracing_subscriber::fmt::layer())
        // 文件里不写 ANSI 颜色转义，否则导出/查看的日志满是控制字符。
        // span 字段按 FormatFields 的类型缓存在 span 扩展里：若与控制台层共用 DefaultFields，
        // 文件层会直接复用控制台格式化好的（带颜色的）span 字段，所以这里用独立的类型。
        .with(
            tracing_subscriber::fmt::layer()
                .with_ansi(false)
                .fmt_fields(PlainFields::default())
                .with_writer(file.clone()),
        )
        .with(log_capture.as_layer())
        .try_init();
    if let Err(e) = installed {
        // 进程内已有全局 subscriber（只会出现在测试里），不影响后续逻辑
        eprintln!("安装全局日志 subscriber 失败: {e}");
    }

    let _ = FILE_WRITER.set(file);
    let _ = CAPTURE.set(log_capture.clone());
    Ok(log_capture)
}

/// 文件层专用的字段格式化器，行为与 `DefaultFields` 相同，只是类型不同，
/// 让文件层拥有自己的 span 字段缓存（见 `init`）。
#[derive(Debug, Default)]
struct PlainFields(tracing_subscriber::fmt::format::DefaultFields);

impl<'writer> tracing_subscriber::fmt::FormatFields<'writer> for PlainFields {
    fn format_fields<R: tracing_subscriber::field::RecordFields>(
        &self,
        writer: tracing_subscriber::fmt::format::Writer<'writer>,
        fields: R,
    ) -> std::fmt::Result {
        self.0.format_fields(writer, fields)
    }
}

/// 已初始化的日志捕获层（未初始化时为 None）
pub fn capture() -> Option<Arc<LogCapture>> {
    CAPTURE.get().cloned()
}

/// 清空日志文件（日志页「清空」）
///
/// 轮转写入器已接管该文件时在其锁内截断并重置计数，避免与并发写入交错；
/// 文件不存在视为已清空。
pub fn truncate_log_file(path: &Path) -> io::Result<()> {
    if let Some(writer) = FILE_WRITER.get()
        && writer.path() == path
    {
        return writer.truncate();
    }
    match std::fs::OpenOptions::new()
        .write(true)
        .truncate(true)
        .open(path)
    {
        Ok(_) => Ok(()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(()),
        Err(e) => Err(e),
    }
}

/// 按大小轮转的日志文件写入器
///
/// 每次写入前检查累计字节数，即将超过上限时把当前文件改名为 `<name>.1`（覆盖旧备份）
/// 并重新创建。tracing 的 fmt 层每个事件只调用一次 `write_all`，轮转总发生在整行之间。
pub struct RotatingFile {
    path: PathBuf,
    max_bytes: u64,
    state: Mutex<RotatingState>,
}

struct RotatingState {
    file: Option<File>,
    written: u64,
}

fn open_append(path: &Path) -> io::Result<File> {
    let mut options = std::fs::OpenOptions::new();
    options.create(true).append(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    options.open(path)
}

impl RotatingFile {
    /// 打开（必要时创建）日志文件；已超过上限的旧文件先轮转
    pub fn open(path: PathBuf, max_bytes: u64) -> io::Result<Self> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let existing = std::fs::metadata(&path).map(|m| m.len()).unwrap_or(0);
        let this = Self {
            path,
            max_bytes: max_bytes.max(1),
            state: Mutex::new(RotatingState {
                file: None,
                written: 0,
            }),
        };
        {
            let mut state = this.state.lock();
            if existing > this.max_bytes {
                this.rotate_locked(&mut state)?;
            } else {
                state.file = Some(open_append(&this.path)?);
                state.written = existing;
            }
        }
        Ok(this)
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    fn backup_path(&self) -> PathBuf {
        let mut name = self
            .path
            .file_name()
            .map(|n| n.to_os_string())
            .unwrap_or_default();
        name.push(".1");
        self.path.with_file_name(name)
    }

    fn rotate_locked(&self, state: &mut RotatingState) -> io::Result<()> {
        // 先关闭旧句柄再改名
        state.file = None;
        let backup = self.backup_path();
        let _ = std::fs::remove_file(&backup);
        match std::fs::rename(&self.path, &backup) {
            Ok(()) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            Err(_) => {
                // 改名失败时退化为截断，保证文件大小有上界
                std::fs::OpenOptions::new()
                    .write(true)
                    .truncate(true)
                    .open(&self.path)?;
            }
        }
        state.file = Some(open_append(&self.path)?);
        state.written = 0;
        Ok(())
    }

    /// 截断当前日志文件并重置计数
    pub fn truncate(&self) -> io::Result<()> {
        let mut state = self.state.lock();
        state.file = None;
        std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .open(&self.path)?;
        state.file = Some(open_append(&self.path)?);
        state.written = 0;
        Ok(())
    }
}

impl Write for &RotatingFile {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        let mut state = self.state.lock();
        if state.written > 0
            && state.written.saturating_add(buf.len() as u64) > self.max_bytes
            && let Err(e) = self.rotate_locked(&mut state)
        {
            // 不能在写入器里再打 tracing 日志（会递归），只输出到 stderr
            eprintln!("日志文件轮转失败 {}: {e}", self.path.display());
        }
        let Some(file) = state.file.as_mut() else {
            // 文件不可用时丢弃本行，日志写入失败不应影响业务
            return Ok(buf.len());
        };
        let n = file.write(buf)?;
        state.written = state.written.saturating_add(n as u64);
        Ok(n)
    }

    fn flush(&mut self) -> io::Result<()> {
        let mut state = self.state.lock();
        match state.file.as_mut() {
            Some(file) => file.flush(),
            None => Ok(()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_line(writer: &RotatingFile, line: &str) {
        let mut w = writer;
        w.write_all(line.as_bytes()).unwrap();
    }

    #[test]
    fn rotates_when_size_limit_reached_during_writes() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("proxy.log");
        let writer = RotatingFile::open(path.clone(), 64).unwrap();
        for i in 0..10 {
            write_line(&writer, &format!("line-{i:02}-0123456789\n"));
        }
        let backup = dir.path().join("proxy.log.1");
        assert!(backup.exists(), "超过上限后应生成 proxy.log.1");
        assert!(std::fs::metadata(&path).unwrap().len() <= 64);
        assert!(std::fs::metadata(&backup).unwrap().len() <= 64);
        // 最新一行一定在当前文件里，且轮转发生在整行之间
        let current = std::fs::read_to_string(&path).unwrap();
        assert!(current.ends_with("line-09-0123456789\n"));
        assert!(current.lines().all(|l| l.starts_with("line-")));
    }

    #[test]
    fn rotates_oversized_file_on_open() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("proxy.log");
        std::fs::write(&path, vec![b'x'; 200]).unwrap();
        let writer = RotatingFile::open(path.clone(), 100).unwrap();
        assert_eq!(
            std::fs::metadata(dir.path().join("proxy.log.1"))
                .unwrap()
                .len(),
            200
        );
        write_line(&writer, "fresh\n");
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "fresh\n");
    }

    #[test]
    fn truncate_resets_file_and_counter() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("proxy.log");
        let writer = RotatingFile::open(path.clone(), 40).unwrap();
        write_line(&writer, "0123456789012345678901234567890\n");
        writer.truncate().unwrap();
        assert_eq!(std::fs::metadata(&path).unwrap().len(), 0);
        // 计数已清零：再写一行不应立刻触发轮转
        write_line(&writer, "after\n");
        assert!(!dir.path().join("proxy.log.1").exists());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "after\n");
    }

    #[test]
    fn truncate_log_file_tolerates_missing_file() {
        let dir = tempfile::tempdir().unwrap();
        assert!(truncate_log_file(&dir.path().join("missing.log")).is_ok());
    }
}
