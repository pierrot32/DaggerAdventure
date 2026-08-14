use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, models::AdventureNote};

pub async fn list(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
) -> Result<Vec<AdventureNote>, AppError> {
    sqlx::query_as::<_, AdventureNote>(
        "SELECT id, adventure_id, creator_id, title, body, created_at, updated_at
         FROM adventure_notes
         WHERE adventure_id = $1 AND creator_id = $2
         ORDER BY updated_at DESC, id",
    )
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::from)
}

pub async fn create(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
    title: &str,
    body: &str,
) -> Result<AdventureNote, AppError> {
    sqlx::query_as::<_, AdventureNote>(
        "INSERT INTO adventure_notes (id, adventure_id, creator_id, title, body)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, adventure_id, creator_id, title, body, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(adventure_id)
    .bind(creator_id)
    .bind(title)
    .bind(body)
    .fetch_one(pool)
    .await
    .map_err(AppError::from)
}

pub async fn update(
    pool: &PgPool,
    adventure_id: Uuid,
    note_id: Uuid,
    creator_id: Uuid,
    title: &str,
    body: &str,
) -> Result<Option<AdventureNote>, AppError> {
    sqlx::query_as::<_, AdventureNote>(
        "UPDATE adventure_notes
         SET title = $1, body = $2, updated_at = now()
         WHERE id = $3 AND adventure_id = $4 AND creator_id = $5
         RETURNING id, adventure_id, creator_id, title, body, created_at, updated_at",
    )
    .bind(title)
    .bind(body)
    .bind(note_id)
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)
}

pub async fn delete(
    pool: &PgPool,
    adventure_id: Uuid,
    note_id: Uuid,
    creator_id: Uuid,
) -> Result<bool, AppError> {
    Ok(sqlx::query(
        "DELETE FROM adventure_notes
         WHERE id = $1 AND adventure_id = $2 AND creator_id = $3",
    )
    .bind(note_id)
    .bind(adventure_id)
    .bind(creator_id)
    .execute(pool)
    .await?
    .rows_affected()
        > 0)
}
