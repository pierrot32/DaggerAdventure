use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use uuid::Uuid;

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AccessLevel {
    Nothing,
    PlayerOnly,
    AdventureMaker,
    Admin,
}

impl AccessLevel {
    pub fn rank(self) -> u8 {
        match self {
            Self::Nothing => 0,
            Self::PlayerOnly => 1,
            Self::AdventureMaker => 2,
            Self::Admin => 3,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Nothing => "nothing",
            Self::PlayerOnly => "player_only",
            Self::AdventureMaker => "adventure_maker",
            Self::Admin => "admin",
        }
    }
}

impl FromStr for AccessLevel {
    type Err = ();

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        match value {
            "nothing" => Ok(Self::Nothing),
            "player_only" => Ok(Self::PlayerOnly),
            "adventure_maker" => Ok(Self::AdventureMaker),
            "admin" => Ok(Self::Admin),
            _ => Err(()),
        }
    }
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub password_hash: String,
    pub access_level: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct UserResponse {
    pub id: Uuid,
    pub email: String,
    pub name: String,
    pub access_level: String,
}

impl From<User> for UserResponse {
    fn from(user: User) -> Self {
        Self {
            id: user.id,
            email: user.email,
            name: user.name,
            access_level: user.access_level,
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
