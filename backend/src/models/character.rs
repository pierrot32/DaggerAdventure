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
    pub birth_city: String,
    #[serde(default)]
    pub family_members: Value,
    pub connections: Value,
    pub equipment: Value,
    pub domain_cards: Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct CharacterSummary {
    pub id: Uuid,
    pub name: String,
    pub level: i32,
    pub class_id: String,
    pub ancestry_id: String,
    pub community_id: String,
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
    pub birth_city: Option<String>,
    #[serde(default)]
    pub family_members: Value,
    #[serde(default)]
    pub connections: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCharacterStatsRequest {
    pub stats: Value,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCharacterAdvancementRequest {
    pub level: i32,
    pub choices: Value,
    #[serde(default)]
    pub experience: Option<String>,
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
    pub advancements: Value,
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
    pub birth_city: String,
    pub family_members: Value,
    pub connections: Value,
    pub equipment: Value,
    pub domain_cards: Value,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[cfg(test)]
mod tests {
    use super::{CharacterSummary, UpdateCharacterRequest};
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn character_summary_serializes_only_vault_fields() {
        let summary = CharacterSummary {
            id: Uuid::nil(),
            name: "Test Hero".to_owned(),
            level: 1,
            class_id: "warrior".to_owned(),
            ancestry_id: "human".to_owned(),
            community_id: "wanderborne".to_owned(),
        };

        assert_eq!(
            serde_json::to_value(summary).expect("summary should serialize"),
            json!({
                "id": Uuid::nil(),
                "name": "Test Hero",
                "level": 1,
                "class_id": "warrior",
                "ancestry_id": "human",
                "community_id": "wanderborne"
            })
        );
    }

    #[test]
    fn update_birth_city_distinguishes_omitted_from_explicit_empty() {
        let omitted: UpdateCharacterRequest = serde_json::from_value(json!({
            "name": "Test Hero",
            "pronouns": "they/them",
            "description": "A test hero",
            "experiences": [],
            "equipment": {},
            "family_members": [],
            "connections": []
        }))
        .expect("legacy update payload should deserialize");
        let explicit_empty: UpdateCharacterRequest = serde_json::from_value(json!({
            "name": "Test Hero",
            "pronouns": "they/them",
            "description": "A test hero",
            "birth_city": "",
            "experiences": [],
            "equipment": {},
            "family_members": [],
            "connections": []
        }))
        .expect("current update payload should deserialize");

        assert_eq!(omitted.birth_city, None);
        assert_eq!(explicit_empty.birth_city, Some(String::new()));
    }
}
