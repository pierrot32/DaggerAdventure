use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateAdventureRequest {
    pub name: String,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateInviteRequest {
    pub email: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Adventure {
    pub id: Uuid,
    pub creator_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AdventureInvite {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub inviter_id: Uuid,
    pub recipient_email: String,
    pub recipient_user_id: Option<Uuid>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub accepted_at: Option<DateTime<Utc>>,
}
