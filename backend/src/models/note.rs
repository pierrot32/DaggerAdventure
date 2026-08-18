use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateNoteRequest {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub section_id: Option<Uuid>,
    #[serde(default)]
    pub position: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateNoteRequest {
    pub title: String,
    pub body: String,
    #[serde(default)]
    pub section_id: Option<Uuid>,
    #[serde(default)]
    pub position: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct NoteSectionRequest {
    pub name: String,
    #[serde(default)]
    pub position: Option<i32>,
}

#[derive(Debug, Deserialize)]
pub struct ReorderNoteRequest {
    pub section_id: Uuid,
    pub position: i32,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AdventureNote {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub creator_id: Uuid,
    pub section_id: Uuid,
    pub title: String,
    pub body: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct AdventureNoteSection {
    pub id: Uuid,
    pub adventure_id: Uuid,
    pub creator_id: Uuid,
    pub name: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CharacterNote {
    pub id: Uuid,
    pub character_id: Uuid,
    pub owner_id: Uuid,
    pub section_id: Uuid,
    pub title: String,
    pub body: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CharacterNoteSection {
    pub id: Uuid,
    pub character_id: Uuid,
    pub owner_id: Uuid,
    pub name: String,
    pub position: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct CharacterNotesResponse {
    pub role: String,
    pub sections: Vec<CharacterNoteSection>,
    pub notes: Vec<CharacterNote>,
}
