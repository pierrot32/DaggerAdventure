use axum::{
    Json,
    extract::State,
    http::{HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};

use crate::{
    error::AppError,
    models::{LoginRequest, MessageResponse, RegisterRequest, UserResponse},
    services::auth_service::{self, TOKEN_LIFETIME_SECONDS},
    state::AppState,
};

pub async fn register(
    State(state): State<AppState>,
    Json(request): Json<RegisterRequest>,
) -> Result<Response, AppError> {
    let result =
        auth_service::register(&state.db, &state.config.jwt_secret, request)
            .await?;
    Ok(auth_response(
        StatusCode::CREATED,
        &result.user,
        &result.token,
        state.config.cookie_secure,
    ))
}

pub async fn login(
    State(state): State<AppState>,
    Json(request): Json<LoginRequest>,
) -> Result<Response, AppError> {
    let result =
        auth_service::login(&state.db, &state.config.jwt_secret, request)
            .await?;
    Ok(auth_response(
        StatusCode::OK,
        &result.user,
        &result.token,
        state.config.cookie_secure,
    ))
}

pub async fn logout(State(state): State<AppState>) -> Response {
    let mut response = (
        StatusCode::OK,
        Json(MessageResponse {
            message: "Signed out".to_owned(),
        }),
    )
        .into_response();
    response.headers_mut().insert(
        header::SET_COOKIE,
        expired_cookie(state.config.cookie_secure),
    );
    response
}

fn auth_response(
    status: StatusCode,
    user: &UserResponse,
    token: &str,
    secure: bool,
) -> Response {
    let mut response = (status, Json(user)).into_response();
    response
        .headers_mut()
        .insert(header::SET_COOKIE, auth_cookie(token, secure));
    response
}

fn auth_cookie(token: &str, secure: bool) -> HeaderValue {
    let secure_flag = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "auth_token={token}; Path=/; Max-Age={TOKEN_LIFETIME_SECONDS}; HttpOnly; SameSite=Strict{secure_flag}"
    ))
    .expect("auth cookie should be a valid header value")
}

fn expired_cookie(secure: bool) -> HeaderValue {
    let secure_flag = if secure { "; Secure" } else { "" };
    HeaderValue::from_str(&format!(
        "auth_token=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict{secure_flag}"
    ))
    .expect("expired cookie should be a valid header value")
}
