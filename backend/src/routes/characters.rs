use axum::{Json, extract::State};

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, Character, CreateCharacterRequest},
    repository::character_repo,
    state::AppState,
    utils::validation,
};

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<Character>>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    Ok(Json(
        character_repo::list_for_user(&state.db, user.id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(mut request): Json<CreateCharacterRequest>,
) -> Result<(axum::http::StatusCode, Json<Character>), AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    request.name = validation::validate_name(&request.name)?;
    request.pronouns = request.pronouns.trim().to_owned();
    request.description = request.description.trim().to_owned();
    if request.pronouns.is_empty() || request.description.is_empty() {
        return Err(AppError::Validation(
            "Pronouns and description are required".to_owned(),
        ));
    }
    Ok((
        axum::http::StatusCode::CREATED,
        Json(character_repo::create(&state.db, user.id, &request).await?),
    ))
}
