use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, Character, CreateCharacterRequest, UpdateCharacterStatsRequest},
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

#[derive(Debug, Deserialize)]
pub struct LinkAdventureRequest {
    pub adventure_id: Option<Uuid>,
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    character_repo::find_visible_to_user(&state.db, user.id, character_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}

pub async fn update_stats(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
    Json(request): Json<UpdateCharacterStatsRequest>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    if !request.stats.is_object() {
        return Err(AppError::Validation(
            "Character stats must be an object".to_owned(),
        ));
    }
    character_repo::update_stats(&state.db, user.id, character_id, &request.stats)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}

pub async fn link_adventure(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
    Json(request): Json<LinkAdventureRequest>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    if let Some(adventure_id) = request.adventure_id {
        let adventure =
            crate::repository::adventure_repo::find_visible(&state.db, &user, adventure_id)
                .await?
                .ok_or_else(|| {
                    AppError::Forbidden("You must belong to that adventure first".to_owned())
                })?;
        if adventure.creator_id != user.id {
            let is_member = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM adventure_members WHERE adventure_id = $1 AND user_id = $2 AND status = 'accepted')",
            )
            .bind(adventure_id)
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
            if !is_member {
                return Err(AppError::Forbidden(
                    "You must belong to that adventure first".to_owned(),
                ));
            }
        }
    }
    character_repo::link_to_adventure(&state.db, user.id, character_id, request.adventure_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}
