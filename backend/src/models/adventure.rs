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

#[derive(Debug, Deserialize)]
pub struct UpdateFearRequest {
    pub fear: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Adventure {
    pub id: Uuid,
    pub creator_id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub fear: i32,
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

/// Invitation addressed to the current account, enriched for the inbox view.
#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct PendingInviteView {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub adventure_name: String,
    pub inviter_name: String,
    pub recipient_email: String,
    pub status: String,
    pub created_at: DateTime<Utc>,
}
