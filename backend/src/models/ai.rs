use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
}

#[derive(Debug, Serialize)]
pub struct GenerateResponse {
    pub content: String,
}

#[derive(Debug, Deserialize)]
pub struct GenerateCharacterRequest {
    pub values: Value,
    pub locked_fields: Vec<String>,
    pub fields: Vec<String>,
    pub options: Value,
    #[serde(default)]
    pub expand_current: bool,
}

#[derive(Debug, Serialize)]
pub struct GenerateCharacterResponse {
    pub values: Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AiGenerationLog {
    pub id: Uuid,
    pub user_id: Uuid,
    pub user_email: String,
    pub generation_type: String,
    pub prompt: String,
    pub response: String,
    pub created_at: DateTime<Utc>,
}
