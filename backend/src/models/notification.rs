use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Notification {
    pub id: Uuid,
    pub recipient_user_id: Uuid,
    pub actor_user_id: Option<Uuid>,
    pub adventure_id: Option<Uuid>,
    pub invite_id: Option<Uuid>,
    pub notification_type: String,
    pub title: String,
    pub body: String,
    pub read_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}
