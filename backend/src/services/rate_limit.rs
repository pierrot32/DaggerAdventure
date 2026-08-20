use std::net::SocketAddr;

use axum::http::HeaderMap;
use chrono::{DateTime, Duration, Utc};
use sha2::{Digest, Sha256};
use sqlx::PgPool;

use crate::{error::AppError, repository::rate_limit_repo};

#[derive(Clone, Copy)]
pub struct Policy {
    pub max_attempts: i32,
    pub window_seconds: i64,
}

pub const REGISTER_IP: Policy = Policy {
    max_attempts: 5,
    window_seconds: 15 * 60,
};
pub const REGISTER_EMAIL: Policy = Policy {
    max_attempts: 3,
    window_seconds: 60 * 60,
};
pub const LOGIN_IP: Policy = Policy {
    max_attempts: 20,
    window_seconds: 15 * 60,
};
pub const LOGIN_EMAIL: Policy = Policy {
    max_attempts: 10,
    window_seconds: 15 * 60,
};
pub const RESEND_IP: Policy = Policy {
    max_attempts: 5,
    window_seconds: 60 * 60,
};
pub const RESEND_EMAIL: Policy = Policy {
    max_attempts: 3,
    window_seconds: 60 * 60,
};
pub const VERIFY_IP: Policy = Policy {
    max_attempts: 10,
    window_seconds: 15 * 60,
};

pub async fn enforce(
    pool: &PgPool,
    scope: &str,
    identity: &str,
    policy: Policy,
) -> Result<(), AppError> {
    let bucket_key = hashed_key(scope, identity);
    let bucket = rate_limit_repo::consume(
        pool,
        scope,
        &bucket_key,
        policy.window_seconds,
    )
    .await
    .map_err(AppError::from)?;
    if bucket.attempts > policy.max_attempts {
        return Err(AppError::RateLimited {
            message: "Too many attempts. Please try again later.".to_owned(),
            retry_after: retry_after_seconds(
                Utc::now(),
                bucket.window_started_at,
                policy.window_seconds,
            ),
        });
    }
    Ok(())
}

pub fn client_ip(
    connection: Option<SocketAddr>,
    headers: &HeaderMap,
    trust_proxy_headers: bool,
) -> String {
    if trust_proxy_headers {
        if let Some(value) = headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
        {
            let value = value.trim();
            if !value.is_empty() {
                return value.to_owned();
            }
        }
        if let Some(value) = headers
            .get("x-real-ip")
            .and_then(|value| value.to_str().ok())
        {
            let value = value.trim();
            if !value.is_empty() {
                return value.to_owned();
            }
        }
    }
    connection
        .map(|address| address.ip().to_string())
        .unwrap_or_else(|| "unknown".to_owned())
}

pub fn hashed_key(scope: &str, identity: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(scope.as_bytes());
    hasher.update([0]);
    hasher.update(identity.as_bytes());
    format!("{:x}", hasher.finalize())
}

pub fn retry_after_seconds(
    now: DateTime<Utc>,
    window_started_at: DateTime<Utc>,
    window_seconds: i64,
) -> u64 {
    (window_started_at + Duration::seconds(window_seconds) - now)
        .num_seconds()
        .max(1) as u64
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hashes_same_identity_without_storing_it() {
        let first = hashed_key("login_email", "user@example.com");
        assert_eq!(first, hashed_key("login_email", "user@example.com"));
        assert_ne!(first, hashed_key("login_email", "other@example.com"));
        assert!(!first.contains("user@example.com"));
    }

    #[test]
    fn retry_after_is_positive_and_uses_window_end() {
        let started = Utc::now();
        assert_eq!(retry_after_seconds(started, started, 60), 60);
        assert_eq!(
            retry_after_seconds(started + Duration::seconds(61), started, 60),
            1
        );
    }

    #[test]
    fn forwarded_headers_are_ignored_without_explicit_proxy_trust() {
        let mut headers = HeaderMap::new();
        headers.insert("x-forwarded-for", "203.0.113.99".parse().unwrap());
        headers.insert("x-real-ip", "203.0.113.99".parse().unwrap());
        let connection = "192.0.2.10:8080".parse().unwrap();

        assert_eq!(client_ip(Some(connection), &headers, false), "192.0.2.10");
    }
}
