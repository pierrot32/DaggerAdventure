use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{
        AccessLevel, Adventure, AdventureInvite, CreateAdventureRequest, CreateInviteRequest,
        PendingInviteView, UpdateFearRequest,
    },
    repository::adventure_repo,
    state::AppState,
    utils::validation,
};

pub async fn characters(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<Vec<crate::models::Character>>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let adventure = adventure_repo::find_visible(&state.db, &user, adventure_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;
    if adventure.creator_id != user.id {
        return Err(AppError::Forbidden(
            "Only the GM can view player characters".to_owned(),
        ));
    }
    Ok(Json(
        crate::repository::character_repo::list_for_adventure(&state.db, adventure_id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(request): Json<CreateAdventureRequest>,
) -> Result<(axum::http::StatusCode, Json<Adventure>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let name = validation::validate_name(&request.name)?;
    let description = request
        .description
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty());
    if description.is_some_and(|value| value.chars().count() > 2000) {
        return Err(AppError::Validation(
            "Description must be 2000 characters or fewer".to_owned(),
        ));
    }
    let adventure = adventure_repo::create(&state.db, user.id, &name, description).await?;
    Ok((axum::http::StatusCode::CREATED, Json(adventure)))
}

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<Adventure>>, AppError> {
    Ok(Json(adventure_repo::list_visible(&state.db, &user).await?))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<Adventure>, AppError> {
    adventure_repo::find_visible(&state.db, &user, adventure_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))
}

pub async fn create_invite(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
    Json(request): Json<CreateInviteRequest>,
) -> Result<(axum::http::StatusCode, Json<AdventureInvite>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let email = validation::normalize_email(&request.email)?;
    let invite = adventure_repo::create_invite(&state.db, &user, adventure_id, &email).await?;
    Ok((axum::http::StatusCode::CREATED, Json(invite)))
}

pub async fn list_invites(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<Vec<AdventureInvite>>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    Ok(Json(
        adventure_repo::list_invites(&state.db, user.id, adventure_id).await?,
    ))
}

pub async fn accept_invite(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(invite_id): Path<Uuid>,
) -> Result<Json<AdventureInvite>, AppError> {
    // The invitation itself is the authorization to join; playing still needs PlayerOnly.
    Ok(Json(
        adventure_repo::accept_invite(&state.db, &user, invite_id).await?,
    ))
}

pub async fn decline_invite(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(invite_id): Path<Uuid>,
) -> Result<Json<AdventureInvite>, AppError> {
    Ok(Json(
        adventure_repo::decline_invite(&state.db, &user, invite_id).await?,
    ))
}

pub async fn my_invites(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<PendingInviteView>>, AppError> {
    Ok(Json(
        adventure_repo::list_pending_for_user(&state.db, &user).await?,
    ))
}

pub async fn update_fear(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
    Json(request): Json<UpdateFearRequest>,
) -> Result<Json<Adventure>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    Ok(Json(
        adventure_repo::update_fear(&state.db, &user, adventure_id, request.fear).await?,
    ))
}
