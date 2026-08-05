use axum::Json;

use crate::{
    middleware::auth_guard::AuthUser,
    models::{MessageResponse, UserResponse},
};

pub async fn me(AuthUser(user): AuthUser) -> Json<UserResponse> {
    Json(user.into())
}

pub async fn hello(AuthUser(user): AuthUser) -> Json<MessageResponse> {
    Json(MessageResponse {
        message: format!("Welcome, {}", user.name),
    })
}
