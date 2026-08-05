use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub password_hash: String,
    // 'player' | 'gm' | 'admin', enforced in Rust rather than a DB enum
    pub role: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub role: String,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub name: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct MessageResponse {
    pub message: String,
}
