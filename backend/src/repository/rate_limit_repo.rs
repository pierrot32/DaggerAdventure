use chrono::{DateTime, Utc};
use sqlx::PgPool;

#[derive(Debug, sqlx::FromRow)]
pub struct RateLimitBucket {
    pub attempts: i32,
    pub window_started_at: DateTime<Utc>,
}

pub async fn consume(
    pool: &PgPool,
    scope: &str,
    bucket_key: &str,
    window_seconds: i64,
) -> Result<RateLimitBucket, sqlx::Error> {
    sqlx::query(
        "DELETE FROM auth_rate_limit_buckets
         WHERE updated_at < now() - ($1::bigint * interval '1 second')",
    )
    .bind(24 * 60 * 60_i64)
    .execute(pool)
    .await?;

    sqlx::query_as::<_, RateLimitBucket>(
        "INSERT INTO auth_rate_limit_buckets
             (scope, bucket_key, window_started_at, attempts)
         VALUES ($1, $2, now(), 1)
         ON CONFLICT (scope, bucket_key) DO UPDATE
         SET window_started_at = CASE
                 WHEN auth_rate_limit_buckets.window_started_at
                     <= now() - ($3::bigint * interval '1 second')
                 THEN now()
                 ELSE auth_rate_limit_buckets.window_started_at
             END,
             attempts = CASE
                 WHEN auth_rate_limit_buckets.window_started_at
                     <= now() - ($3::bigint * interval '1 second')
                 THEN 1
                 ELSE auth_rate_limit_buckets.attempts + 1
             END,
             updated_at = now()
         RETURNING attempts, window_started_at",
    )
    .bind(scope)
    .bind(bucket_key)
    .bind(window_seconds)
    .fetch_one(pool)
    .await
}
