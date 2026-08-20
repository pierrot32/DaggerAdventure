use chrono::{DateTime, Utc};
use sqlx::{Postgres, Transaction};
use uuid::Uuid;

use crate::models::User;

const EXPIRED_TOKEN_CLEANUP_LIMIT: i64 = 50;

pub async fn insert_for_user(
    pool: &sqlx::PgPool,
    user_id: Uuid,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    let mut transaction = pool.begin().await?;
    insert_for_user_in_transaction(
        &mut transaction,
        user_id,
        token_hash,
        expires_at,
    )
    .await?;
    transaction.commit().await
}

pub async fn insert_for_user_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    user_id: Uuid,
    token_hash: &[u8],
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "WITH expired AS (
             SELECT token_hash
             FROM email_verification_tokens
             WHERE user_id = $1 AND expires_at <= now()
             ORDER BY expires_at, token_hash
             LIMIT $2
         )
         DELETE FROM email_verification_tokens
         WHERE token_hash IN (SELECT token_hash FROM expired)",
    )
    .bind(user_id)
    .bind(EXPIRED_TOKEN_CLEANUP_LIMIT)
    .execute(&mut **transaction)
    .await?;
    sqlx::query(
        "INSERT INTO email_verification_tokens (token_hash, user_id, expires_at)
         VALUES ($1, $2, $3)",
    )
    .bind(token_hash)
    .bind(user_id)
    .bind(expires_at)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub async fn consume(
    transaction: &mut Transaction<'_, Postgres>,
    token_hash: &[u8],
) -> Result<Option<User>, sqlx::Error> {
    let row = sqlx::query_as::<_, (Uuid, DateTime<Utc>)>(
        "SELECT user_id, expires_at
         FROM email_verification_tokens
         WHERE token_hash = $1
         FOR UPDATE",
    )
    .bind(token_hash)
    .fetch_optional(&mut **transaction)
    .await?;

    let Some((user_id, expires_at)) = row else {
        return Ok(None);
    };
    sqlx::query("DELETE FROM email_verification_tokens WHERE token_hash = $1")
        .bind(token_hash)
        .execute(&mut **transaction)
        .await?;
    if expires_at <= Utc::now() {
        return Ok(None);
    }

    sqlx::query_as::<_, User>(
        "UPDATE users SET email_verified_at = COALESCE(email_verified_at, now())
         WHERE id = $1
         RETURNING id, email, name, password_hash, access_level,
               ai_generation_enabled, email_verified_at,
               email_verification_required, created_at",
    )
    .bind(user_id)
    .fetch_optional(&mut **transaction)
    .await
}
