use jsonwebtoken::{EncodingKey, Header, encode};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    config::Config,
    error::AppError,
    models::{LoginRequest, RegisterRequest, User, UserResponse},
    repository::verification_repo,
    repository::{adventure_repo, user_repo},
    services::email_service,
    services::password,
    utils::validation,
};

pub const TOKEN_LIFETIME_SECONDS: i64 = 60 * 60 * 24 * 7;
pub const VERIFICATION_TOKEN_LIFETIME_SECONDS: i64 = 60 * 60;

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

pub async fn register_pending(
    pool: &PgPool,
    config: &Config,
    request: RegisterRequest,
) -> Result<(), AppError> {
    let email = validation::normalize_email(&request.email)?;
    let name = validation::validate_name(&request.name)?;
    validation::validate_password(&request.password)?;
    let password_hash = password::hash(&request.password).map_err(|_| {
        AppError::Internal("unable to hash password".to_owned())
    })?;

    email_service::ensure_delivery_available(config)?;

    let (token, token_hash, expires_at) = new_verification_token();
    let mut transaction = pool.begin().await?;
    let user = match user_repo::create_in_transaction(
        &mut transaction,
        Uuid::new_v4(),
        &email,
        &name,
        &password_hash,
    )
    .await
    {
        Ok(user) => user,
        Err(error) if user_repo::is_unique_violation(&error) => return Ok(()),
        Err(error) => return Err(AppError::Internal(error.to_string())),
    };
    verification_repo::insert_for_user_in_transaction(
        &mut transaction,
        user.id,
        &token_hash,
        expires_at,
    )
    .await
    .map_err(AppError::from)?;
    transaction.commit().await?;

    email_service::send_verification_email(config, &user.email, &token)
        .await
        .map_err(|error| {
            eprintln!("verification email delivery failed: {error}");
            AppError::ServiceUnavailable(
                "Email delivery is temporarily unavailable. Please try again later."
                    .to_owned(),
            )
        })?;
    Ok(())
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

    if user.needs_email_verification() {
        return Err(AppError::Forbidden(
            "Verify your email before signing in".to_owned(),
        ));
    }

    let token = issue_token(&user, jwt_secret)?;
    Ok(AuthResult {
        user: user.into(),
        token,
    })
}

pub async fn resend_verification(
    pool: &PgPool,
    config: &Config,
    email: &str,
) -> Result<(), AppError> {
    let email = validation::normalize_email(email)?;
    email_service::ensure_delivery_available(config)?;
    let Some(user) = user_repo::find_by_email(pool, &email).await? else {
        return Ok(());
    };
    if user.email_verified_at.is_some() {
        return Ok(());
    }

    let (token, token_hash, expires_at) = new_verification_token();
    verification_repo::insert_for_user(pool, user.id, &token_hash, expires_at)
        .await
        .map_err(AppError::from)?;
    email_service::send_verification_email(config, &user.email, &token)
        .await
        .map_err(|error| {
            eprintln!("verification email delivery failed: {error}");
            AppError::ServiceUnavailable(
                "Email delivery is temporarily unavailable. Please try again later."
                    .to_owned(),
            )
        })?;
    Ok(())
}

pub async fn verify_email(
    pool: &PgPool,
    token: &str,
) -> Result<UserResponse, AppError> {
    if token.trim().is_empty() || token.chars().count() > 128 {
        return Err(AppError::Validation(
            "The verification link is invalid or expired".to_owned(),
        ));
    }

    let token_hash = hash_verification_token(token);
    let mut transaction = pool.begin().await?;
    let user = verification_repo::consume(&mut transaction, &token_hash)
        .await?
        .ok_or_else(|| {
            AppError::Validation(
                "The verification link is invalid or expired".to_owned(),
            )
        })?;
    adventure_repo::link_pending_invites_in_transaction(
        &mut transaction,
        &user,
    )
    .await
    .map_err(AppError::from)?;
    transaction.commit().await?;
    Ok(user.into())
}

pub fn new_verification_token()
-> (String, Vec<u8>, chrono::DateTime<chrono::Utc>) {
    let token = Uuid::new_v4().to_string();
    let token_hash = hash_verification_token(&token);
    let expires_at = chrono::Utc::now()
        + chrono::Duration::seconds(VERIFICATION_TOKEN_LIFETIME_SECONDS);
    (token, token_hash, expires_at)
}

pub fn hash_verification_token(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn verification_token_hash_is_one_way_and_stable() {
        let (token, stored, expires_at) = new_verification_token();
        assert_eq!(stored, hash_verification_token(&token));
        assert_ne!(stored, token.as_bytes());
        assert!(expires_at > chrono::Utc::now());
    }

    #[test]
    fn different_verification_tokens_have_different_hashes() {
        let (first, _, _) = new_verification_token();
        let (second, _, _) = new_verification_token();
        assert_ne!(
            hash_verification_token(&first),
            hash_verification_token(&second)
        );
    }
}
