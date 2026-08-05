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
    },
    repository::adventure_repo,
    state::AppState,
    utils::validation,
};

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
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    Ok(Json(
        adventure_repo::accept_invite(&state.db, &user, invite_id).await?,
    ))
}

pub async fn decline_invite(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(invite_id): Path<Uuid>,
) -> Result<Json<AdventureInvite>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    Ok(Json(
        adventure_repo::decline_invite(&state.db, &user, invite_id).await?,
    ))
}
