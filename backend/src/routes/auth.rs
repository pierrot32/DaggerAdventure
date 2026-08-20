use axum::{
    Json,
    extract::{ConnectInfo, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
};
use std::net::SocketAddr;

use crate::{
    error::AppError,
    models::{
        LoginRequest, MessageResponse, RegisterRequest,
        ResendVerificationRequest, UserResponse, VerifyEmailRequest,
    },
    services::auth_service::{self, TOKEN_LIFETIME_SECONDS},
    services::rate_limit,
    state::AppState,
    utils::validation,
};

pub async fn register(
    State(state): State<AppState>,
    headers: HeaderMap,
    connection: Option<ConnectInfo<SocketAddr>>,
    Json(request): Json<RegisterRequest>,
) -> Result<Response, AppError> {
    let ip = rate_limit::client_ip(
        connection.map(|info| info.0),
        &headers,
        state.config.trust_proxy_headers,
    );
    rate_limit::enforce(&state.db, "register_ip", &ip, rate_limit::REGISTER_IP)
        .await?;
    if let Ok(email) = validation::normalize_email(&request.email) {
        rate_limit::enforce(
            &state.db,
            "register_email",
            &email,
            rate_limit::REGISTER_EMAIL,
        )
        .await?;
    }
    auth_service::register_pending(&state.db, &state.config, request).await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(MessageResponse {
            message: "If the address is eligible, check your email for a verification link. Delivery must be configured by the server.".to_owned(),
        }),
    )
        .into_response())
}

pub async fn login(
    State(state): State<AppState>,
    headers: HeaderMap,
    connection: Option<ConnectInfo<SocketAddr>>,
    Json(request): Json<LoginRequest>,
) -> Result<Response, AppError> {
    let ip = rate_limit::client_ip(
        connection.map(|info| info.0),
        &headers,
        state.config.trust_proxy_headers,
    );
    rate_limit::enforce(&state.db, "login_ip", &ip, rate_limit::LOGIN_IP)
        .await?;
    if let Ok(email) = validation::normalize_email(&request.email) {
        rate_limit::enforce(
            &state.db,
            "login_email",
            &email,
            rate_limit::LOGIN_EMAIL,
        )
        .await?;
    }
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

pub async fn resend_verification(
    State(state): State<AppState>,
    headers: HeaderMap,
    connection: Option<ConnectInfo<SocketAddr>>,
    Json(request): Json<ResendVerificationRequest>,
) -> Result<Response, AppError> {
    let ip = rate_limit::client_ip(
        connection.map(|info| info.0),
        &headers,
        state.config.trust_proxy_headers,
    );
    rate_limit::enforce(&state.db, "resend_ip", &ip, rate_limit::RESEND_IP)
        .await?;
    let email = validation::normalize_email(&request.email)?;
    rate_limit::enforce(
        &state.db,
        "resend_email",
        &email,
        rate_limit::RESEND_EMAIL,
    )
    .await?;
    auth_service::resend_verification(&state.db, &state.config, &email).await?;
    Ok((
        StatusCode::ACCEPTED,
        Json(MessageResponse {
            message: "If an account can receive mail at that address, a verification link may be sent.".to_owned(),
        }),
    )
        .into_response())
}

pub async fn verify_email(
    State(state): State<AppState>,
    headers: HeaderMap,
    connection: Option<ConnectInfo<SocketAddr>>,
    Json(request): Json<VerifyEmailRequest>,
) -> Result<Response, AppError> {
    let ip = rate_limit::client_ip(
        connection.map(|info| info.0),
        &headers,
        state.config.trust_proxy_headers,
    );
    rate_limit::enforce(&state.db, "verify_ip", &ip, rate_limit::VERIFY_IP)
        .await?;
    let mut response =
        Json(auth_service::verify_email(&state.db, &request.token).await?)
            .into_response();
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response.headers_mut().insert(
        header::REFERRER_POLICY,
        HeaderValue::from_static("no-referrer"),
    );
    Ok(response)
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
