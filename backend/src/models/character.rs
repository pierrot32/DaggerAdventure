use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateCharacterRequest {
    pub adventure_id: Option<Uuid>,
    #[serde(default)]
    pub stats: Value,
    pub name: String,
    pub pronouns: String,
    pub description: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub height: String,
    #[serde(default)]
    pub weight: String,
    #[serde(default)]
    pub eye_color: String,
    #[serde(default)]
    pub hair_color: String,
    #[serde(default)]
    pub skin_color: String,
    #[serde(default)]
    pub look_description: String,
    pub class_id: String,
    pub subclass_id: String,
    pub ancestry_id: String,
    pub secondary_ancestry_id: Option<String>,
    pub community_id: String,
    pub traits: Value,
    pub experiences: Value,
    pub background_answers: Value,
    #[serde(default)]
    pub background_story: String,
    #[serde(default)]
    pub background_notes: String,
    #[serde(default)]
    pub family_members: Value,
    pub connections: Value,
    pub equipment: Value,
    pub domain_cards: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCharacterRequest {
    pub name: String,
    pub pronouns: String,
    pub description: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub height: String,
    #[serde(default)]
    pub weight: String,
    #[serde(default)]
    pub eye_color: String,
    #[serde(default)]
    pub hair_color: String,
    #[serde(default)]
    pub skin_color: String,
    #[serde(default)]
    pub look_description: String,
    pub experiences: Value,
    pub equipment: Value,
    #[serde(default)]
    pub background_story: String,
    #[serde(default)]
    pub background_notes: String,
    #[serde(default)]
    pub family_members: Value,
    #[serde(default)]
    pub connections: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCharacterStatsRequest {
    pub stats: Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Character {
    pub id: Uuid,
    pub user_id: Uuid,
    pub adventure_id: Option<Uuid>,
    pub stats: Value,
    pub name: String,
    pub pronouns: String,
    pub description: String,
    pub size: String,
    pub height: String,
    pub weight: String,
    pub eye_color: String,
    pub hair_color: String,
    pub skin_color: String,
    pub look_description: String,
    pub portrait_url: Option<String>,
    pub level: i32,
    pub class_id: String,
    pub subclass_id: String,
    pub ancestry_id: String,
    pub secondary_ancestry_id: Option<String>,
    pub community_id: String,
    pub traits: Value,
    pub experiences: Value,
    pub background_answers: Value,
    pub background_story: String,
    pub background_notes: String,
    pub family_members: Value,
    pub connections: Value,
    pub equipment: Value,
    pub domain_cards: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
