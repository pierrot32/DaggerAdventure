use jsonwebtoken::{EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{LoginRequest, RegisterRequest, User, UserResponse},
    repository::{adventure_repo, user_repo},
    services::password,
    utils::validation,
};

pub const TOKEN_LIFETIME_SECONDS: i64 = 60 * 60 * 24 * 7;

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub email: String,
    pub iat: i64,
    pub exp: i64,
}

pub struct AuthResult {
    pub user: UserResponse,
    pub token: String,
}

pub async fn register(
    pool: &PgPool,
    jwt_secret: &str,
    request: RegisterRequest,
) -> Result<AuthResult, AppError> {
    let email = validation::normalize_email(&request.email)?;
    let name = validation::validate_name(&request.name)?;
    validation::validate_password(&request.password)?;

    let password_hash = password::hash(&request.password).map_err(|_| {
        AppError::Internal("unable to hash password".to_owned())
    })?;

    let user =
        user_repo::create(pool, Uuid::new_v4(), &email, &name, &password_hash)
            .await
            .map_err(|error| {
                if user_repo::is_unique_violation(&error) {
                    AppError::Conflict(
                        "An account with that email already exists".to_owned(),
                    )
                } else {
                    AppError::Internal(error.to_string())
                }
            })?;

    let token = issue_token(&user, jwt_secret)?;
    adventure_repo::link_pending_invites(pool, &user)
        .await
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(AuthResult {
        user: user.into(),
        token,
    })
}

pub async fn login(
    pool: &PgPool,
    jwt_secret: &str,
    request: LoginRequest,
) -> Result<AuthResult, AppError> {
    let email = validation::normalize_email(&request.email)?;

    let user =
        user_repo::find_by_email(pool, &email)
            .await?
            .ok_or_else(|| {
                AppError::Unauthorized("Invalid email or password".to_owned())
            })?;

    if !password::verify(&request.password, &user.password_hash) {
        return Err(AppError::Unauthorized(
            "Invalid email or password".to_owned(),
        ));
    }

    let token = issue_token(&user, jwt_secret)?;
    Ok(AuthResult {
        user: user.into(),
        token,
    })
}

fn issue_token(user: &User, jwt_secret: &str) -> Result<String, AppError> {
    let now = chrono::Utc::now().timestamp();
    let claims = Claims {
        sub: user.id,
        email: user.email.clone(),
        iat: now,
        exp: now + TOKEN_LIFETIME_SECONDS,
    };
    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|error| AppError::Internal(error.to_string()))
}
