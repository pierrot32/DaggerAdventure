use axum::{Json, extract::State};

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, ImportBookRequest, SourceBook},
    repository::content_repo,
    state::AppState,
};

pub async fn get_character_creation_book(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
) -> Result<Json<SourceBook>, AppError> {
    content_repo::find_character_creation_book(&state.db)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("No Daggerheart book has been imported yet".to_owned()))
}

pub async fn import_book(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(request): Json<ImportBookRequest>,
) -> Result<Json<SourceBook>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    if request.id.trim().is_empty()
        || request.title.trim().is_empty()
        || request.version.trim().is_empty()
        || !request.content.is_object()
    {
        return Err(AppError::Validation(
            "A book import needs an id, title, version, and object content".to_owned(),
        ));
    }
    Ok(Json(content_repo::import_book(&state.db, &request).await?))
}
