use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use crate::{
    error::AppError, middleware::auth_guard::AuthUser, models::Notification,
    repository::notification_repo, state::AppState,
};

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<Notification>>, AppError> {
    Ok(Json(
        notification_repo::list_for_user(&state.db, user.id).await?,
    ))
}

pub async fn mark_read(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(notification_id): Path<Uuid>,
) -> Result<Json<Notification>, AppError> {
    Ok(Json(
        notification_repo::mark_read(&state.db, user.id, notification_id)
            .await?,
    ))
}
