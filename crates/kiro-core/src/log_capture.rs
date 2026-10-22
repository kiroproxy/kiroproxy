// Copyright (c) 2026 Harllan He. Licensed under MIT.
//! 内存日志捕获层 — 将 tracing 事件存入 ring buffer 并通过 broadcast 广播

use std::collections::VecDeque;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, Ordering};

use parking_lot::Mutex;
use serde::Serialize;
use tokio::sync::broadcast;
use tracing::{Event, Level, Subscriber};
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;

/// 广播缓冲：前端按批次转发，突发日志（如开启 DEBUG）时留出足够余量
const BROADCAST_CAPACITY: usize = 4096;

/// 进程级日志序号：从 1 开始单调递增，前端用它去重快照与实时事件的重叠部分
static NEXT_SEQ: AtomicU64 = AtomicU64::new(1);

fn next_seq() -> u64 {
    NEXT_SEQ.fetch_add(1, Ordering::Relaxed)
}

#[derive(Clone, Debug, Serialize)]
pub struct LogEntry {
    /// 捕获时分配的进程内单调序号（从 1 开始）
    pub seq: u64,
    pub timestamp: String,
    pub level: String,
    pub target: String,
    pub message: String,
}

pub struct LogCapture {
    ring_buffer: Arc<Mutex<VecDeque<LogEntry>>>,
    sender: broadcast::Sender<LogEntry>,
    capacity: usize,
}

impl LogCapture {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(BROADCAST_CAPACITY);
        Self {
            ring_buffer: Arc::new(Mutex::new(VecDeque::with_capacity(capacity))),
            sender,
            capacity,
        }
    }

    pub fn as_layer(&self) -> LogCaptureLayer {
        LogCaptureLayer {
            ring_buffer: self.ring_buffer.clone(),
            sender: self.sender.clone(),
            capacity: self.capacity,
        }
    }

    /// 写入一条日志（序号在 ring buffer 锁内分配，保证缓冲区与广播内的顺序一致）
    fn push(
        ring_buffer: &Mutex<VecDeque<LogEntry>>,
        sender: &broadcast::Sender<LogEntry>,
        capacity: usize,
        level: &str,
        target: &str,
        message: String,
    ) {
        let timestamp = chrono::Utc::now()
            .format("%Y-%m-%dT%H:%M:%S%.3fZ")
            .to_string();
        let mut buf = ring_buffer.lock();
        let entry = LogEntry {
            seq: next_seq(),
            timestamp,
            level: level.to_string(),
            target: target.to_string(),
            message,
        };
        if buf.len() >= capacity {
            buf.pop_front();
        }
        buf.push_back(entry.clone());
        // 持锁发送：并发线程的广播顺序与 seq 顺序一致；无接收者时 send 返回 Err，属正常情况
        let _ = sender.send(entry);
    }

    /// 测试/诊断用：直接写入一条日志，不经过 tracing
    pub fn record(&self, level: &str, target: &str, message: impl Into<String>) {
        Self::push(
            &self.ring_buffer,
            &self.sender,
            self.capacity,
            level,
            target,
            message.into(),
        );
    }

    /// 返回当前 ring buffer 快照（全量复制）
    pub fn snapshot(&self) -> Vec<LogEntry> {
        self.ring_buffer.lock().iter().cloned().collect()
    }

    /// 订阅后续新事件（返回 broadcast::Receiver）
    pub fn subscribe(&self) -> broadcast::Receiver<LogEntry> {
        self.sender.subscribe()
    }

    /// 清空 ring buffer（不影响已订阅的接收者）
    pub fn clear(&self) {
        self.ring_buffer.lock().clear();
    }
}

pub struct LogCaptureLayer {
    ring_buffer: Arc<Mutex<VecDeque<LogEntry>>>,
    sender: broadcast::Sender<LogEntry>,
    capacity: usize,
}

impl<S: Subscriber> Layer<S> for LogCaptureLayer {
    fn on_event(&self, event: &Event<'_>, _ctx: Context<'_, S>) {
        let metadata = event.metadata();
        let level = match *metadata.level() {
            Level::TRACE => "TRACE",
            Level::DEBUG => "DEBUG",
            Level::INFO => "INFO",
            Level::WARN => "WARN",
            Level::ERROR => "ERROR",
        };

        let mut message = String::new();
        event.record(&mut MessageVisitor(&mut message));

        LogCapture::push(
            &self.ring_buffer,
            &self.sender,
            self.capacity,
            level,
            metadata.target(),
            message,
        );
    }
}

struct MessageVisitor<'a>(&'a mut String);

impl<'a> tracing::field::Visit for MessageVisitor<'a> {
    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.0.push_str(value);
        } else {
            if !self.0.is_empty() {
                self.0.push(' ');
            }
            self.0.push_str(&format!("{}={}", field.name(), value));
        }
    }

    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        let s = format!("{:?}", value);
        if field.name() == "message" {
            // 去掉 Debug 输出的外层引号（字符串类型会被加引号）
            if s.starts_with('"') && s.ends_with('"') && s.len() >= 2 {
                self.0.push_str(&s[1..s.len() - 1]);
            } else {
                self.0.push_str(&s);
            }
        } else {
            if !self.0.is_empty() {
                self.0.push(' ');
            }
            self.0.push_str(&format!("{}={}", field.name(), s));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seq_is_monotonic_across_snapshot_and_broadcast() {
        let capture = LogCapture::new(8);
        let mut rx = capture.subscribe();
        for i in 0..5 {
            capture.record("INFO", "kiro_core::test", format!("line {i}"));
        }
        let snapshot = capture.snapshot();
        assert_eq!(snapshot.len(), 5);
        assert!(snapshot.iter().all(|e| e.seq >= 1));
        assert!(snapshot.windows(2).all(|w| w[0].seq < w[1].seq));

        // 广播顺序与快照一致
        let mut received = Vec::new();
        while let Ok(entry) = rx.try_recv() {
            received.push(entry.seq);
        }
        let expected: Vec<u64> = snapshot.iter().map(|e| e.seq).collect();
        assert_eq!(received, expected);
    }

    #[test]
    fn seq_keeps_increasing_after_ring_buffer_eviction_and_clear() {
        let capture = LogCapture::new(2);
        capture.record("INFO", "t", "a");
        capture.record("INFO", "t", "b");
        capture.record("INFO", "t", "c");
        let snapshot = capture.snapshot();
        assert_eq!(snapshot.len(), 2);
        assert_eq!(snapshot[0].message, "b");
        let last = snapshot[1].seq;

        capture.clear();
        capture.record("WARN", "t", "d");
        let after = capture.snapshot();
        assert_eq!(after.len(), 1);
        assert!(after[0].seq > last, "清空后序号不得回退");
    }

    #[test]
    fn seq_is_unique_under_concurrent_writers() {
        let capture = Arc::new(LogCapture::new(10_000));
        let handles: Vec<_> = (0..4)
            .map(|t| {
                let capture = capture.clone();
                std::thread::spawn(move || {
                    for i in 0..250 {
                        capture.record("DEBUG", "t", format!("{t}-{i}"));
                    }
                })
            })
            .collect();
        for h in handles {
            h.join().unwrap();
        }
        let snapshot = capture.snapshot();
        assert_eq!(snapshot.len(), 1000);
        // 缓冲区内按写入顺序排列，序号严格递增（无重复）
        assert!(snapshot.windows(2).all(|w| w[0].seq < w[1].seq));
    }

    #[test]
    fn log_entry_serializes_seq_field() {
        let capture = LogCapture::new(1);
        capture.record("INFO", "kiro_core", "hello");
        let json = serde_json::to_value(&capture.snapshot()[0]).unwrap();
        assert!(json["seq"].as_u64().unwrap() >= 1);
        assert_eq!(json["level"], "INFO");
        assert_eq!(json["target"], "kiro_core");
        assert_eq!(json["message"], "hello");
        assert!(json["timestamp"].is_string());
    }
}
