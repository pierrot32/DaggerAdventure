use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{Character, CreateCharacterRequest};

const CHARACTER_FIELDS: &str = "id, user_id, adventure_id, name, pronouns, description, size,
    height, weight, eye_color, hair_color, skin_color, look_description, portrait_url, level,
    class_id, subclass_id, ancestry_id, secondary_ancestry_id, community_id, traits,
    experiences, background_answers, background_story, background_notes, family_members,
    connections, equipment, domain_cards, stats, created_at, updated_at";

pub async fn create(
    pool: &PgPool,
    user_id: Uuid,
    request: &CreateCharacterRequest,
) -> Result<Character, sqlx::Error> {
    let query = format!(
        "INSERT INTO characters
         (id, user_id, adventure_id, name, pronouns, description, size, height, weight,
          eye_color, hair_color, skin_color, look_description, class_id, subclass_id,
          ancestry_id, secondary_ancestry_id, community_id, traits, experiences,
          background_answers, background_story, background_notes, family_members,
          connections, equipment, domain_cards, stats)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28)
         RETURNING {CHARACTER_FIELDS}"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(Uuid::new_v4())
        .bind(user_id)
        .bind(request.adventure_id)
        .bind(&request.name)
        .bind(&request.pronouns)
        .bind(&request.description)
        .bind(&request.size)
        .bind(&request.height)
        .bind(&request.weight)
        .bind(&request.eye_color)
        .bind(&request.hair_color)
        .bind(&request.skin_color)
        .bind(&request.look_description)
        .bind(&request.class_id)
        .bind(&request.subclass_id)
        .bind(&request.ancestry_id)
        .bind(&request.secondary_ancestry_id)
        .bind(&request.community_id)
        .bind(&request.traits)
        .bind(&request.experiences)
        .bind(&request.background_answers)
        .bind(&request.background_story)
        .bind(&request.background_notes)
        .bind(&request.family_members)
        .bind(&request.connections)
        .bind(&request.equipment)
        .bind(&request.domain_cards)
        .bind(&request.stats)
        .fetch_one(pool)
        .await
}

pub async fn find_for_user(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
) -> Result<Option<Character>, sqlx::Error> {
    let query = format!("SELECT {CHARACTER_FIELDS} FROM characters WHERE id = $1 AND user_id = $2");
    sqlx::query_as::<_, Character>(&query)
        .bind(character_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn find_visible_to_user(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
) -> Result<Option<Character>, sqlx::Error> {
    // Columns must be qualified with c. - characters and adventures share names
    // (id, name, description, created_at, updated_at), which Postgres rejects as ambiguous.
    let query =
        "SELECT c.id, c.user_id, c.adventure_id, c.name, c.pronouns, c.description, c.level,
        c.size, c.height, c.weight, c.eye_color, c.hair_color, c.skin_color, c.look_description,
        c.portrait_url,
        c.class_id, c.subclass_id, c.ancestry_id, c.secondary_ancestry_id, c.community_id, c.traits,
        c.experiences, c.background_answers, c.background_story, c.background_notes, c.family_members,
        c.connections, c.equipment, c.domain_cards, c.stats,
        c.created_at, c.updated_at
         FROM characters c
         LEFT JOIN adventures a ON a.id = c.adventure_id
         WHERE c.id = $1 AND (c.user_id = $2 OR a.creator_id = $2)";
    sqlx::query_as::<_, Character>(query)
        .bind(character_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn list_for_adventure(
    pool: &PgPool,
    adventure_id: Uuid,
) -> Result<Vec<Character>, sqlx::Error> {
    let query = format!(
        "SELECT {CHARACTER_FIELDS} FROM characters
         WHERE adventure_id = $1 ORDER BY updated_at DESC, id"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(adventure_id)
        .fetch_all(pool)
        .await
}

pub async fn link_to_adventure(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
    adventure_id: Option<Uuid>,
) -> Result<Option<Character>, sqlx::Error> {
    let query = format!(
        "UPDATE characters SET adventure_id = $1, updated_at = now()
         WHERE id = $2 AND user_id = $3 RETURNING {CHARACTER_FIELDS}"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(adventure_id)
        .bind(character_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn update_stats(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
    stats: &serde_json::Value,
) -> Result<Option<Character>, sqlx::Error> {
    let query = format!(
        "UPDATE characters SET stats = $1, updated_at = now()
         WHERE id = $2 AND user_id = $3 RETURNING {CHARACTER_FIELDS}"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(stats)
        .bind(character_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn update(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
    request: &crate::models::UpdateCharacterRequest,
) -> Result<Option<Character>, sqlx::Error> {
    let query = format!(
        "UPDATE characters SET name = $1, pronouns = $2, description = $3, size = $4,
         height = $5, weight = $6, eye_color = $7, hair_color = $8, skin_color = $9,
         look_description = $10, experiences = $11, equipment = $12,
         background_story = $13, background_notes = $14, family_members = $15,
         updated_at = now()
         WHERE id = $16 AND user_id = $17 RETURNING {CHARACTER_FIELDS}"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(&request.name)
        .bind(&request.pronouns)
        .bind(&request.description)
        .bind(&request.size)
        .bind(&request.height)
        .bind(&request.weight)
        .bind(&request.eye_color)
        .bind(&request.hair_color)
        .bind(&request.skin_color)
        .bind(&request.look_description)
        .bind(&request.experiences)
        .bind(&request.equipment)
        .bind(&request.background_story)
        .bind(&request.background_notes)
        .bind(&request.family_members)
        .bind(character_id)
        .bind(user_id)
        .fetch_optional(pool)
        .await
}

pub async fn update_portrait(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
    portrait_url: &str,
) -> Result<Option<Character>, sqlx::Error> {
    let query = format!(
        "UPDATE characters SET portrait_url = $1, updated_at = now()
         WHERE id = $2 AND user_id = $3 RETURNING {CHARACTER_FIELDS}"
    );
    sqlx::query_as::<_, Character>(&query)
        .bind(portrait_url)
        .bind(character_id)
        .bind(user_id)
        .fetch_optional(pool)
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

pub async fn delete_for_user(
    pool: &PgPool,
    user_id: Uuid,
    character_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query("DELETE FROM characters WHERE id = $1 AND user_id = $2")
        .bind(character_id)
        .bind(user_id)
        .execute(pool)
        .await?;
    Ok(result.rows_affected() == 1)
}
