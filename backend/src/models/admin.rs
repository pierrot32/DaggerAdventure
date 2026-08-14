use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::AccessLevel;

#[derive(Debug, Deserialize)]
pub struct UserListQuery {
    pub search: Option<String>,
    pub access_level: Option<AccessLevel>,
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAccessLevelRequest {
    pub access_level: AccessLevel,
}

#[derive(Debug, Deserialize)]
pub struct UpdateApprovalRequest {
    pub approved: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateAiGenerationRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AdminUser {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub access_level: String,
    pub ai_generation_enabled: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct UserListResponse {
    pub users: Vec<AdminUser>,
    pub total: i64,
    pub page: i64,
    pub limit: i64,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AccessAuditEvent {
    pub id: Uuid,
    pub actor_id: Uuid,
    pub target_user_id: Uuid,
    pub previous_access_level: String,
    pub new_access_level: String,
    pub created_at: DateTime<Utc>,
}
