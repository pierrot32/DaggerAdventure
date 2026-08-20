use std::env;

#[derive(Clone)]
pub struct Config {
    pub database_url: String,
    pub jwt_secret: String,
    pub cookie_secure: bool,
    pub port: u16,
    pub admin_email: Option<String>,
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

        Self {
            database_url: env::var("DATABASE_URL")
                .expect("DATABASE_URL must be set"),
            jwt_secret,
            cookie_secure: env::var("COOKIE_SECURE")
                .map(|value| value.eq_ignore_ascii_case("true"))
                .unwrap_or(true),
            port: env::var("PORT")
                .ok()
                .and_then(|value| value.parse().ok())
                .unwrap_or(8080),
            admin_email: env::var("ADMIN_EMAIL").ok(),
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
