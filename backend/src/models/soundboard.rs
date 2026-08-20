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

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SoundSource {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub website_url: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct SoundSourceRequest {
    pub name: String,
    pub website_url: String,
    #[serde(default)]
    pub description: String,
}

#[derive(Debug, Serialize)]
pub struct SoundLibraryTrack {
    pub id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub audio_url: Option<String>,
    pub audio_mime_type: Option<String>,
    pub image_url: Option<String>,
    pub creator_name: Option<String>,
    pub source_id: Option<Uuid>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub source_description: Option<String>,
    pub source_credit: Option<String>,
    pub has_audio_upload: bool,
    pub has_image_upload: bool,
    pub board_ids: Vec<Uuid>,
    pub labels: Vec<SoundLabel>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SoundRecord {
    pub id: Uuid,
    pub board_id: Uuid,
    pub library_track_id: Option<Uuid>,
    pub name: String,
    pub audio_url: Option<String>,
    pub audio_mime_type: Option<String>,
    pub image_url: Option<String>,
    pub creator_name: Option<String>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub source_credit: Option<String>,
    pub has_audio_upload: bool,
    pub has_image_upload: bool,
    pub labels: Vec<SoundLabel>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct SoundBoardDetail {
    pub board: SoundBoard,
    pub sounds: Vec<SoundRecord>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detail_serializes_with_a_nested_board() {
        let board_id = Uuid::new_v4();
        let detail = SoundBoardDetail {
            board: SoundBoard {
                id: board_id,
                owner_id: Uuid::new_v4(),
                owner_name: "GM".to_owned(),
                name: "Night market".to_owned(),
                description: String::new(),
                shared: false,
                sound_count: 0,
                created_at: Utc::now(),
                updated_at: Utc::now(),
            },
            sounds: Vec::new(),
        };

        let serialized = serde_json::to_value(detail).unwrap();
        assert_eq!(serialized["board"]["id"], board_id.to_string());
        assert_eq!(serialized["sounds"], serde_json::json!([]));
        assert!(serialized.get("id").is_none());
    }
}
