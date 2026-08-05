use axum::{
    async_trait,
    extract::{FromRef, FromRequestParts},
    http::{header, request::Parts},
};
use jsonwebtoken::{DecodingKey, Validation, decode};

use crate::{
    error::AppError, models::User, repository::user_repo, services::auth_service::Claims,
    state::AppState,
};

/// Extractor that validates the JWT session cookie and loads the current user.
pub struct AuthUser(pub User);

#[async_trait]
impl<S> FromRequestParts<S> for AuthUser
where
    AppState: FromRef<S>,
    S: Send + Sync,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        let app_state = AppState::from_ref(state);
        let token = cookie_token(parts)
            .ok_or_else(|| AppError::Unauthorized("Not signed in".to_owned()))?;

        let claims = decode::<Claims>(
            &token,
            &DecodingKey::from_secret(app_state.config.jwt_secret.as_bytes()),
            &Validation::default(),
        )
        .map_err(|_| AppError::Unauthorized("Session expired, please sign in again".to_owned()))?
        .claims;

        let user = user_repo::find_by_id(&app_state.db, claims.sub)
            .await?
            .ok_or_else(|| AppError::Unauthorized("Not signed in".to_owned()))?;

        Ok(AuthUser(user))
    }
}

fn cookie_token(parts: &Parts) -> Option<String> {
    parts
        .headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| part.trim().strip_prefix("auth_token=").map(str::to_owned))
}
