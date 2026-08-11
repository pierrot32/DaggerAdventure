use backend::{
    models::{AccessLevel, ImportBookRequest, RegisterRequest},
    services::auth_service::{self, AuthResult},
};
use serde_json::{Value, json};
use sqlx::PgPool;

pub fn sample_book(id: &str) -> ImportBookRequest {
    ImportBookRequest {
        id: id.to_owned(),
        title: format!("Test Book {id}"),
        version: "test-1".to_owned(),
        source_file: format!("{id}.json"),
        content: sample_content("blade", "Duelist"),
    }
}

pub fn sample_content(class_id: &str, subclass_id: &str) -> Value {
    json!({
        "character_creation": {
            "trait_proposals": {},
            "connections_prompt": "Who helped you survive?"
        },
        "classes": [{
            "id": class_id,
            "name": "Blade",
            "description": "A disciplined fighter.",
            "domains": ["blade", "bone"],
            "starting_evasion": 10,
            "hit_points": 6,
            "items": ["A well-used weapon"],
            "hope_feature": "Spend Hope to press the attack.",
            "class_features": [{"name": "Battle Ready"}],
            "background_questions": ["Where did you learn to fight?"],
            "subclasses": [{
                "id": subclass_id,
                "name": "Duelist",
                "description": "A precise combatant.",
                "spellcast_trait": "Agility",
                "foundation_features": [{"name": "Measured Strike"}],
                "specialization_features": [{"name": "Riposte"}],
                "mastery_features": [{"name": "Perfect Form"}]
            }]
        }]
    })
}

#[allow(dead_code)]
pub async fn player_user(pool: &PgPool, jwt_secret: &str) -> AuthResult {
    auth_service::register(
        pool,
        jwt_secret,
        RegisterRequest {
            email: format!("player-{}@example.com", uuid::Uuid::new_v4()),
            name: "Test Player".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("player registration should succeed")
}

#[allow(dead_code)]
pub async fn admin_user(pool: &PgPool, jwt_secret: &str) -> AuthResult {
    let response = auth_service::register(
        pool,
        jwt_secret,
        RegisterRequest {
            email: format!("admin-{}@example.com", uuid::Uuid::new_v4()),
            name: "Test Admin".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("admin registration should succeed");
    sqlx::query("UPDATE users SET access_level = $1 WHERE id = $2")
        .bind(AccessLevel::Admin.as_str())
        .bind(response.user.id)
        .execute(pool)
        .await
        .expect("admin promotion should succeed");
    response
}
