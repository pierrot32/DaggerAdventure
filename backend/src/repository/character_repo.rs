use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Character, CreateCharacterRequest};

const CHARACTER_FIELDS: &str = "id, user_id, adventure_id, name, pronouns, description, level,
    class_id, subclass_id, ancestry_id, secondary_ancestry_id, community_id, traits,
    experiences, background_answers, connections, equipment, domain_cards, created_at, updated_at";

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    request: &CreateCharacterRequest,
) -> Result<Character, sqlx::Error> {
    let query = format!(
        "INSERT INTO characters
         (id, user_id, adventure_id, name, pronouns, description, class_id, subclass_id,
          ancestry_id, secondary_ancestry_id, community_id, traits, experiences,
          background_answers, connections, equipment, domain_cards)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
         RETURNING {CHARACTER_FIELDS}"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(request.adventure_id)
        .bind(&request.name)
        .bind(&request.pronouns)
        .bind(&request.description)
        .bind(&request.class_id)
        .bind(&request.subclass_id)
        .bind(&request.ancestry_id)
        .bind(&request.secondary_ancestry_id)
        .bind(&request.community_id)
        .bind(&request.traits)
        .bind(&request.experiences)
        .bind(&request.background_answers)
        .bind(&request.connections)
        .bind(&request.equipment)
        .bind(&request.domain_cards)
        .fetch_one(pool)
        .await
}

pub async fn list_for_user(pool: &PgPool, user_id: Uuid) -> Result<Vec<Character>, sqlx::Error> {
    let query = format!(
        "SELECT {CHARACTER_FIELDS} FROM characters
         WHERE user_id = $1 ORDER BY updated_at DESC, id"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(user_id)
        .fetch_all(pool)
        .await
}
