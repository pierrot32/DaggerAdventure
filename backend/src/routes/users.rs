use axum::{Json, extract::State};

use crate::{
    middleware::auth_guard::AuthUser,
    models::{MessageResponse, UpdateUserRequest, UserResponse},
    repository::user_repo,
    state::AppState,
    utils::validation,
};

pub async fn me(AuthUser(user): AuthUser) -> Json<UserResponse> {
    Json(user.into())
}

pub async fn update_me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(request): Json<UpdateUserRequest>,
) -> Result<Json<UserResponse>, crate::error::AppError> {
    let name = validation::validate_name(&request.name)?;
    user_repo::update_name(&state.db, user.id, &name)
        .await?
        .map(|updated| Json(updated.into()))
        .ok_or_else(|| {
            crate::error::AppError::NotFound("Account not found".to_owned())
        })
}

pub async fn delete_me(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<MessageResponse>, crate::error::AppError> {
    if !user_repo::delete_account(&state.db, user.id).await? {
        return Err(crate::error::AppError::NotFound(
            "Account not found".to_owned(),
        ));
    }
    Ok(Json(MessageResponse {
        message: "Account deleted".to_owned(),
    }))
}

pub async fn hello(AuthUser(user): AuthUser) -> Json<MessageResponse> {
    Json(MessageResponse {
        message: format!("Welcome, {}", user.name),
    })
}
