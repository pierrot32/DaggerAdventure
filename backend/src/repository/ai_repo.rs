use sqlx::PgPool;
use uuid::Uuid;

use crate::models::AiGenerationLog;

pub async fn insert_log(
    pool: &PgPool,
    user_id: Uuid,
    generation_type: &str,
    prompt: &str,
    response: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO ai_generation_logs (id, user_id, generation_type, prompt, response)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(user_id)
    .bind(generation_type)
    .bind(prompt)
    .bind(response)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn list_logs(
    pool: &PgPool,
    page: i64,
    limit: i64,
) -> Result<Vec<AiGenerationLog>, sqlx::Error> {
    let page = page.max(1);
    let limit = limit.clamp(1, 100);
    sqlx::query_as::<_, AiGenerationLog>(
        "SELECT l.id, l.user_id, u.email AS user_email, l.generation_type,
            l.prompt, l.response, l.created_at
         FROM ai_generation_logs l
         JOIN users u ON u.id = l.user_id
         ORDER BY created_at DESC, id
         LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind((page - 1) * limit)
    .fetch_all(pool)
    .await
}
