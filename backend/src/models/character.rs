use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct CreateCharacterRequest {
    pub adventure_id: Option<Uuid>,
    pub name: String,
    pub pronouns: String,
    pub description: String,
    pub class_id: String,
    pub subclass_id: String,
    pub ancestry_id: String,
    pub secondary_ancestry_id: Option<String>,
    pub community_id: String,
    pub traits: Value,
    pub experiences: Value,
    pub background_answers: Value,
    pub connections: Value,
    pub equipment: Value,
    pub domain_cards: Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct Character {
    pub id: Uuid,
    pub user_id: Uuid,
    pub adventure_id: Option<Uuid>,
    pub name: String,
    pub pronouns: String,
    pub description: String,
    pub level: i32,
    pub class_id: String,
    pub subclass_id: String,
    pub ancestry_id: String,
    pub secondary_ancestry_id: Option<String>,
    pub community_id: String,
    pub traits: Value,
    pub experiences: Value,
    pub background_answers: Value,
    pub connections: Value,
    pub equipment: Value,
    pub domain_cards: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
