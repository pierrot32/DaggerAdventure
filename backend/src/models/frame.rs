use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateCampaignFrameRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub complexity_rating: i32,
    pub content: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCampaignFrameRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    pub complexity_rating: i32,
    pub content: Value,
}

#[derive(Debug, Deserialize)]
pub struct AttachAdventureFrameRequest {
    pub source_type: String,
    pub source_id: Option<String>,
    #[serde(default)]
    pub content: Option<Value>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAdventureFrameRequest {
    pub content: Value,
    pub selections: Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CampaignFrame {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub description: String,
    pub complexity_rating: i32,
    pub content: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AdventureFrame {
    pub adventure_id: Uuid,
    pub source_type: String,
    pub source_id: Option<String>,
    pub content: Value,
    pub selections: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
