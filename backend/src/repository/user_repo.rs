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
         RETURNING id, email, name, password_hash, role, created_at",
    )
    .bind(id)
    .bind(email)
    .bind(name)
    .bind(password_hash)
    .fetch_one(pool)
    .await
}

pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, email, name, password_hash, role, created_at
         FROM users WHERE lower(email) = lower($1)",
    )
    .bind(email)
    .fetch_optional(pool)
    .await
}

pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
    sqlx::query_as::<_, User>(
        "SELECT id, email, name, password_hash, role, created_at
         FROM users WHERE id = $1",
    )
    .bind(id)
    .fetch_optional(pool)
    .await
}

pub fn is_unique_violation(error: &sqlx::Error) -> bool {
    error
        .as_database_error()
        .and_then(|db_error| db_error.code())
        .is_some_and(|code| code == "23505")
}
