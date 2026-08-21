use std::env;

use crate::utils::validation;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub cookie_secure: bool,
    pub trust_proxy_headers: bool,
    pub port: u16,
    pub admin_email: Option<String>,
    pub email_provider: String,
    pub email_from: String,
    pub email_dev_outbox: Option<String>,
    pub email_smtp_host: Option<String>,
    pub email_smtp_port: u16,
    pub email_smtp_username: Option<String>,
    pub email_smtp_password: Option<String>,
    pub email_smtp_tls: String,
    pub email_verification_base_url: String,
    pub openai_api_key: Option<String>,
    pub openai_model: String,
    pub openai_image_model: String,
}

impl Config {
    pub fn from_env() -> Self {
        let jwt_secret =
            env::var("JWT_SECRET").expect("JWT_SECRET must be set");
        if jwt_secret.as_bytes().len() < 32 {
            panic!("JWT_SECRET must contain at least 32 bytes");
        }

        let email_from = env::var("EMAIL_FROM")
            .unwrap_or_else(|_| "no-reply@localhost".to_owned());
        validation::validate_email_from(&email_from).unwrap_or_else(|_| {
            panic!("EMAIL_FROM must be a valid single-line email address")
        });
        let email_verification_base_url =
            env::var("EMAIL_VERIFICATION_BASE_URL").unwrap_or_else(|_| {
                "http://localhost:5173/verify-email".to_owned()
            });
        validation::validate_verification_base_url(&email_verification_base_url)
            .unwrap_or_else(|_| panic!("EMAIL_VERIFICATION_BASE_URL must be a valid single-line HTTP(S) URL without credentials, query, or fragment"));

        Self {
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            jwt_secret,
            cookie_secure: env::var("COOKIE_SECURE")
                .map(|value| value.eq_ignore_ascii_case("true"))
                .unwrap_or(true),
            trust_proxy_headers: env::var("TRUST_PROXY_HEADERS")
                .map(|value| value.eq_ignore_ascii_case("true"))
                .unwrap_or(false),
            port: env::var("PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(8080),
            admin_email: env::var("ADMIN_EMAIL").ok(),
            email_provider: env::var("EMAIL_PROVIDER")
                .unwrap_or_else(|_| "disabled".to_owned()),
            email_from,
            email_dev_outbox: env::var("EMAIL_DEV_OUTBOX").ok(),
            email_smtp_host: env::var("EMAIL_SMTP_HOST").ok(),
            email_smtp_port: env::var("EMAIL_SMTP_PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(587),
            email_smtp_username: env::var("EMAIL_SMTP_USERNAME").ok(),
            email_smtp_password: env::var("EMAIL_SMTP_PASSWORD").ok(),
            email_smtp_tls: env::var("EMAIL_SMTP_TLS")
                .unwrap_or_else(|_| "starttls".to_owned()),
            email_verification_base_url,
            openai_api_key: env::var("OPENAI_API_KEY")
                .ok()
                .filter(|value| !value.trim().is_empty()),
            openai_model: env::var("OPENAI_MODEL")
                .unwrap_or_else(|_| "gpt-5.6-luna".to_owned()),
            openai_image_model: env::var("OPENAI_IMAGE_MODEL")
                .unwrap_or_else(|_| "gpt-image-1-mini".to_owned()),
        }
    }
}
