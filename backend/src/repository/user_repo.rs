use sqlx::PgPool;
use uuid::Uuid;

use crate::models::User;

pub async fn create(
    pool: &PgPool,
    id: Uuid,
    email: &str,
    name: &str,
    password_hash: &str,
) -> Result<User, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "INSERT INTO users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name, password_hash, access_level, ai_generation_enabled, created_at",
    )
    .bind(id)
    .bind(email)
    .bind(name)
    .bind(password_hash)
    .fetch_one(pool)
    .await
}

pub async fn find_by_email(
    pool: &PgPool,
    email: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, email, name, password_hash, access_level, ai_generation_enabled, created_at
         FROM users WHERE lower(email) = lower($1)",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
}

pub async fn find_by_id(
    pool: &PgPool,
    id: Uuid,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, email, name, password_hash, access_level, ai_generation_enabled, created_at
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub async fn bootstrap_admin(
    pool: &PgPool,
    email: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET access_level = 'admin' WHERE lower(email) = lower($1)")
        .bind(email.trim())
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn update_name(
    pool: &PgPool,
    user_id: Uuid,
    name: &str,
) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "UPDATE users SET name = $1
         WHERE id = $2
         RETURNING id, email, name, password_hash, access_level, ai_generation_enabled, created_at",
    )
    .bind(name)
    .bind(user_id)
    .fetch_optional(pool)
    .await
}

pub async fn delete_account(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<bool, sqlx::Error> {
    let mut transaction = pool.begin().await?;

    sqlx::query(
        "DELETE FROM access_level_audit_events
         WHERE actor_id = $1 OR target_user_id = $1",
    )
    .bind(user_id)
    .execute(&mut *transaction)
    .await?;

    sqlx::query("DELETE FROM adventure_invites WHERE inviter_id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;

    sqlx::query("DELETE FROM adventures WHERE creator_id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;

    let deleted = sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user_id)
        .execute(&mut *transaction)
        .await?
        .rows_affected()
        > 0;

    transaction.commit().await?;
    Ok(deleted)
}

pub fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|db_error| db_error.code())
        .is_some_and(|code| code == "23505")
}
