use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::{Request, header, request::Parts},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};

use crate::{
    error::AppError, models::User, repository::user_repo,
    services::auth_service::Claims, state::AppState,
};

/// Authenticated user loaded from the session cookie.
#[derive(Clone)]
pub struct AuthUser(pub User);

/// Authenticates every request in the protected API router before its handler runs.
pub async fn require_auth<B>(
    axum::extract::State(state): axum::extract::State<AppState>,
    request: Request<B>,
    next: Next<B>,
) -> Result<Response, AppError> {
    let (mut parts, body) = request.into_parts();
    let user = authenticate(&mut parts, &state).await?;
    parts.extensions.insert(AuthUser(user));
    Ok(next.run(Request::from_parts(parts, body)).await)
}

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> Result<Self, Self::Rejection> {
        if let Some(user) = parts.extensions.get::<AuthUser>() {
            return Ok(user.clone());
        }

        let app_state = AppState::from_ref(state);
        Ok(AuthUser(authenticate(parts, &app_state).await?))
    }
}

async fn authenticate(
    parts: &mut Parts,
    state: &AppState,
) -> Result<User, AppError> {
    let token = cookie_token(parts)
        .ok_or_else(|| AppError::Unauthorized("Not signed in".to_owned()))?;

    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| {
        AppError::Unauthorized(
            "Session expired, please sign in again".to_owned(),
        )
    })?
    .claims;

    user_repo::find_by_id(&state.db, claims.sub)
        .await?
        .ok_or_else(|| AppError::Unauthorized("Not signed in".to_owned()))
        .and_then(|user| {
            if user.needs_email_verification() {
                Err(AppError::Forbidden(
                    "Verify your email before accessing the application"
                        .to_owned(),
                ))
            } else {
                Ok(user)
            }
        })
}

fn cookie_token(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| {
            part.trim().strip_prefix("auth_token=").map(str::to_owned)
        })
}
