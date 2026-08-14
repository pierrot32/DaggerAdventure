use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNoteRequest {
    pub title: String,
    pub body: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AdventureNote {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub creator_id: Uuid,
    pub title: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
