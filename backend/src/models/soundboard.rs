use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateSoundBoardRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub shared: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSoundBoardRequest {
    pub name: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SoundBoard {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub owner_name: String,
    pub name: String,
    pub description: String,
    pub shared: bool,
    pub sound_count: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SoundLabel {
    pub id: Uuid,
    pub name: String,
}

#[derive(Debug, Serialize)]
pub struct SoundRecord {
    pub id: Uuid,
    pub board_id: Uuid,
    pub name: String,
    pub audio_url: Option<String>,
    pub audio_mime_type: Option<String>,
    pub image_url: Option<String>,
    pub creator_name: Option<String>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub has_audio_upload: bool,
    pub has_image_upload: bool,
    pub labels: Vec<SoundLabel>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SoundBoardDetail {
    #[serde(flatten)]
    pub board: SoundBoard,
    pub sounds: Vec<SoundRecord>,
}
