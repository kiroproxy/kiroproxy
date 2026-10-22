// Copyright (c) 2026 pigcursor. Licensed under MIT.

use crate::error::IpcError;
use crate::state::AppState;
use kiro_core::admin::types::AdminModelItem;
use serde::Serialize;

/// 模型列表的桌面端 DTO（camelCase）。
///
/// `AdminModelItem` 平铺 kiro-core 的 `/v1/models` `Model`（snake_case，外部 API 客户端依赖它），
/// 不能直接改它的序列化；这里单独转换给前端使用。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelView {
    pub id: String,
    pub display_name: String,
    #[serde(rename = "type")]
    pub model_type: String,
    pub owned_by: String,
    pub max_tokens: i32,
    pub rate_multiplier: Option<f64>,
    pub released_at: Option<String>,
}

impl From<AdminModelItem> for ModelView {
    fn from(item: AdminModelItem) -> Self {
        let AdminModelItem {
            model,
            rate_multiplier,
            released_at,
        } = item;
        Self {
            id: model.id,
            display_name: model.display_name,
            model_type: model.model_type,
            owned_by: model.owned_by,
            max_tokens: model.max_tokens,
            rate_multiplier,
            released_at,
        }
    }
}

#[tauri::command]
pub async fn list_models(state: tauri::State<'_, AppState>) -> Result<Vec<ModelView>, IpcError> {
    let admin = state.core()?.admin();
    Ok(admin
        .list_admin_models()
        .await
        .into_iter()
        .map(ModelView::from)
        .collect())
}

#[tauri::command]
pub async fn get_account_models(
    state: tauri::State<'_, AppState>,
    id: u64,
) -> Result<Vec<ModelView>, IpcError> {
    let admin = state.core()?.admin();
    let response = admin
        .list_admin_models_for(id)
        .await
        .map_err(IpcError::internal)?;
    Ok(response.data.into_iter().map(ModelView::from).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use kiro_core::anthropic::types::Model;

    #[test]
    fn model_view_serializes_camel_case_with_type() {
        let item = AdminModelItem {
            model: Model {
                id: "claude-opus-5".into(),
                object: "model".into(),
                created: 0,
                owned_by: "anthropic".into(),
                display_name: "Claude Opus 5".into(),
                model_type: "chat".into(),
                max_tokens: 128_000,
            },
            rate_multiplier: Some(2.2),
            released_at: Some("2026-10-12".into()),
        };
        let json = serde_json::to_value(ModelView::from(item)).unwrap();
        assert_eq!(
            json,
            serde_json::json!({
                "id": "claude-opus-5",
                "displayName": "Claude Opus 5",
                "type": "chat",
                "ownedBy": "anthropic",
                "maxTokens": 128000,
                "rateMultiplier": 2.2,
                "releasedAt": "2026-10-12"
            })
        );
    }
}
