use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, models::Notification};

pub async fn list_for_user(
    pool: &PgPool,
    user_id: Uuid,
) -> Result<Vec<Notification>, sqlx::Error> {
    sqlx::query_as::<_, Notification>(
        "SELECT id, recipient_user_id, actor_user_id, adventure_id, invite_id,
                notification_type, title, body, read_at, created_at
         FROM notifications
         WHERE recipient_user_id = $1
         ORDER BY created_at DESC
         LIMIT 100",
    )
    .bind(user_id)
    .fetch_all(pool)
    .await
}

pub async fn mark_read(
    pool: &PgPool,
    user_id: Uuid,
    notification_id: Uuid,
) -> Result<Notification, AppError> {
    sqlx::query_as::<_, Notification>(
        "UPDATE notifications
         SET read_at = COALESCE(read_at, now())
         WHERE id = $1 AND recipient_user_id = $2
         RETURNING id, recipient_user_id, actor_user_id, adventure_id, invite_id,
                   notification_type, title, body, read_at, created_at",
    )
    .bind(notification_id)
    .bind(user_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Notification not found".to_owned()))
}
