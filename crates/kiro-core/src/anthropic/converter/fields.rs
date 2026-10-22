// Copyright (c) 2026 Harllan He. Licensed under MIT.
//! additionalModelRequestFields 构建（thinking/output_config/max_tokens/reasoning）

use std::sync::atomic::{AtomicU8, Ordering};

use crate::anthropic::types::MessagesRequest;

use super::model::is_haiku_55;
use super::thinking::{additional_fields_skipped, is_gpt_model};

/// effort 档位上限的默认值（`xhigh`）。
///
/// 客户端（Claude Code / ZCode 等）几乎总是发 `output_config.effort = "max"`，
/// 实测同一道题同一链路：max 平均 46s / 3,676 思考字符，xhigh 12s / 162 字符，
/// high 9s / 104 字符。max 的思考量是 xhigh 的 20 倍、耗时 4 倍，且这部分
/// 思考对最终回答质量的增益在编码场景里并不相称，故默认钳到 `xhigh`。
pub const DEFAULT_MAX_EFFORT: EffortCap = EffortCap::Xhigh;

/// effort 档位枚举（与 Kiro `output_config.effort` schema 一致，由低到高）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum EffortCap {
    Low = 0,
    Medium = 1,
    High = 2,
    Xhigh = 3,
    Max = 4,
}

impl EffortCap {
    /// 从配置字符串解析；无法识别时返回 `None`（调用方按"不限制"处理）。
    pub fn parse(s: &str) -> Option<Self> {
        match s.trim().to_ascii_lowercase().as_str() {
            "low" => Some(Self::Low),
            "medium" => Some(Self::Medium),
            "high" => Some(Self::High),
            "xhigh" => Some(Self::Xhigh),
            "max" => Some(Self::Max),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Low => "low",
            Self::Medium => "medium",
            Self::High => "high",
            Self::Xhigh => "xhigh",
            Self::Max => "max",
        }
    }

    fn from_u8(v: u8) -> Self {
        match v {
            0 => Self::Low,
            1 => Self::Medium,
            2 => Self::High,
            3 => Self::Xhigh,
            _ => Self::Max,
        }
    }
}

/// 进程级 effort 上限（`Config::max_effort`，默认 `xhigh`）。
static MAX_EFFORT: AtomicU8 = AtomicU8::new(EffortCap::Xhigh as u8);

/// 设置 effort 上限（启动时按 config 初始化；设置页热切换后经此更新）。
pub fn set_max_effort(cap: EffortCap) {
    MAX_EFFORT.store(cap as u8, Ordering::Relaxed);
}

/// 读取当前 effort 上限。
pub fn max_effort() -> EffortCap {
    EffortCap::from_u8(MAX_EFFORT.load(Ordering::Relaxed))
}

/// 把客户端请求的 effort 钳到全局上限；无法识别的档位原样透传
/// （交给上游按 schema 拒绝/默认处理，不因本地解析失败改变行为）。
///
/// 仅下调、不上调：客户端发 `low` 时不会被提到 `xhigh`。
pub(crate) fn clamp_effort(requested: &str) -> String {
    let cap = max_effort();
    match EffortCap::parse(requested) {
        Some(want) if want > cap => {
            tracing::debug!(
                requested_effort = requested,
                applied_effort = cap.as_str(),
                "[EFFORT] 客户端档位超过上限，已下调"
            );
            cap.as_str().to_string()
        }
        _ => requested.to_string(),
    }
}

/// claude-opus-5 / claude-opus-4.7 / claude-opus-4.8 Max Output = 128K（1M 窗口代际）
const MAX_OUTPUT_TOKENS_LARGE_WINDOW: i32 = 128_000;
/// 标准模型（sonnet 等）Max Output = 64K
const MAX_OUTPUT_TOKENS_STANDARD: i32 = 64_000;
/// Kiro 侧 schema 对 max_tokens 的强制最小值（对所有 Claude 代际生效）
const KIRO_MIN_MAX_TOKENS: i32 = 1_024;

/// 根据模型返回 Kiro 允许的 max_tokens 上限
/// claude-opus-5 / claude-opus-4.7 / claude-opus-4.8 Max Output = 128K（1M 窗口代际）
/// claude-sonnet-5 Max Output = 64K，与 sonnet-4.x 同档，走默认分支即可
pub(super) fn model_max_output_tokens(model: &str) -> i32 {
    let m = model.to_lowercase();
    if m.contains("opus-4-7")
        || m.contains("opus-4.7")
        || m.contains("opus-4-8")
        || m.contains("opus-4.8")
        || m.contains("opus-5")
        || m.contains("opus.5")
        || m.contains("opus 5")
        // haiku 5.5：与 5.5 代际同档 128K（1M 窗口代际）
        || is_haiku_55(&m)
    {
        MAX_OUTPUT_TOKENS_LARGE_WINDOW
    } else {
        MAX_OUTPUT_TOKENS_STANDARD
    }
}

/// 构建 additionalModelRequestFields（thinking、output_config、max_tokens、reasoning）
///
/// 实测：claude-sonnet-4.5 / claude-opus-4.5 / claude-haiku-4.5 这三个 "4.5" 代际模型
/// Kiro 后端均拒绝该字段（先后遇到 400 REQUEST_BODY_INVALID：
/// max_tokens、output_config 均不在 schema 定义内且不允许额外属性），需跳过整个字段构建。
///
/// GPT 系（gpt-5.6-luna 等）使用独立的 `reasoning.effort` 结构（抓包实测），
/// 与 Claude 系的 `output_config.effort` 完全分离。
pub(super) fn build_additional_model_request_fields(
    req: &MessagesRequest,
    model_id: &str,
) -> Option<serde_json::Value> {
    // "4.5" 代际整体跳过，见上方实测说明
    if additional_fields_skipped(model_id) {
        return None;
    }

    // GPT 系走 reasoning.effort 路径（抓包实测：luna 使用此结构）
    if is_gpt_model(model_id) {
        let effort = req
            .output_config
            .as_ref()
            .map(|c| c.effort.as_str())
            .filter(|e| !e.is_empty())
            .unwrap_or("high");
        return Some(serde_json::json!({ "reasoning": { "effort": clamp_effort(effort) } }));
    }

    let mut fields = serde_json::Map::new();

    // thinking 注入：仅当客户端请求的 thinking 类型为 adaptive 且模型为 Claude 系时，
    // 注入 `thinking: {"type": "adaptive"}`（Kiro 私有协议唯一实证接受的原生 thinking
    // 形态），使上游产出 reasoningContentEvent，经 `process_native_reasoning` 转发。
    // 账号级开关（`thinkingAdaptive`）在 provider 层按实际选中账号执行剥离
    // （converter 层不持有凭据），此处仅做请求/模型侧判定。
    //
    // 不得对 `enabled` 类型注入（v3.4.1 曾放宽到 enabled，导致客户端规则遵从性回退）：
    // `enabled` 请求已由 `generate_thinking_prefix` 在 history[0] 注入
    // `<thinking_mode>enabled</thinking_mode>` 文本标签协议；若再叠加原生 thinking
    // 字段，同一请求同时携带两套互相独立的 thinking 控制信号（v3.4.0 及之前从未出现
    // 的组合：enabled 只走文本标签，adaptive 只走原生字段），上游行为改变，
    // CLAUDE.md / system-reminder 等客户端规则的遵从度随之下降。
    if req
        .thinking
        .as_ref()
        .map(|t| t.thinking_type == "adaptive")
        .unwrap_or(false)
    {
        fields.insert("thinking".into(), serde_json::json!({ "type": "adaptive" }));
    }

    // effort 透传 + 默认注入：客户端显式携带 output_config 时按原值转发；
    // 未携带时默认注入 effort="low"。
    // 注意：默认注入值历经多次调整——issue #40 曾记录默认注入 effort="high"
    // 导致 sonnet-5 / opus-5 反代链路 TTFB 慢于直连（v3.2.1 改为仅透传修复），
    // 2026-09-15 为对齐 Claude Code 默认推理力度又回退恢复注入（值 high）。
    // 2026-09-24 实测 high 兜底仍使 sonnet-5 显著慢于 opus-5（issue #40 评论
    // 追踪），故兜底值下调为 "low"，在保留"必带 effort 字段"结构的前提下
    // 降低 Kiro 后端推理调度成本。客户端显式携带 output_config 时不受影响。
    let effort = req
        .output_config
        .as_ref()
        .map(|c| c.effort.as_str())
        .filter(|e| !e.is_empty())
        .unwrap_or("low");
    fields.insert(
        "output_config".into(),
        serde_json::json!({ "effort": clamp_effort(effort) }),
    );

    if req.max_tokens > 0 {
        let cap = model_max_output_tokens(&req.model);
        let mut capped = req.max_tokens.min(cap);
        // Kiro 侧 schema 对 max_tokens 强制 minimum = 1024，对所有 Claude 代际生效
        // （实测：claude-sonnet-4-6 在 max_tokens=200 时同样报 400
        // "Invalid additionalModelRequestFields: must have a minimum value of 1024.0"，
        // 并非只有 opus-4.7/4.8/5 的 128000 上限档才有此限制）。
        capped = capped.max(KIRO_MIN_MAX_TOKENS);
        fields.insert("max_tokens".into(), serde_json::json!(capped));
    }

    if fields.is_empty() {
        None
    } else {
        Some(serde_json::Value::Object(fields))
    }
}
