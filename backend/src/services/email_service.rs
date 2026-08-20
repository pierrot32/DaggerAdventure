use std::path::Path;

use tokio::io::AsyncWriteExt;

use crate::{config::Config, error::AppError, utils::validation};

const DELIVERY_UNAVAILABLE_MESSAGE: &str =
    "Email delivery is not configured. Please try again later.";

pub fn ensure_delivery_available(config: &Config) -> Result<(), AppError> {
    let valid_email_from =
        validation::validate_email_from(&config.email_from).is_ok();
    let valid_verification_url = validation::validate_verification_base_url(
        &config.email_verification_base_url,
    )
    .is_ok();
    let outbox_available = match config.email_dev_outbox.as_deref() {
        Some(path) if !path.trim().is_empty() => {
            let outbox = Path::new(path);
            match std::fs::metadata(outbox) {
                Ok(metadata) => metadata.is_file(),
                Err(_) => outbox
                    .parent()
                    .unwrap_or_else(|| Path::new("."))
                    .metadata()
                    .is_ok_and(|metadata| metadata.is_dir()),
            }
        }
        _ => false,
    };
    let configured = config.email_provider == "dev_file"
        && outbox_available
        && valid_email_from
        && valid_verification_url;

    if configured {
        Ok(())
    } else {
        Err(AppError::ServiceUnavailable(
            DELIVERY_UNAVAILABLE_MESSAGE.to_owned(),
        ))
    }
}

pub async fn send_verification_email(
    config: &Config,
    recipient: &str,
    token: &str,
) -> Result<(), String> {
    let recipient = validation::normalize_email(recipient)
        .map_err(|_| "invalid email recipient".to_owned())?;
    let email_from = validation::validate_email_from(&config.email_from)
        .map_err(|_| "invalid EMAIL_FROM".to_owned())?;
    let verification_base_url = validation::validate_verification_base_url(
        &config.email_verification_base_url,
    )
    .map_err(|_| "invalid EMAIL_VERIFICATION_BASE_URL".to_owned())?;
    let path = match config.email_provider.as_str() {
        "dev_file" => config.email_dev_outbox.as_deref().ok_or_else(|| {
            "EMAIL_DEV_OUTBOX is required for dev_file".to_owned()
        })?,
        "disabled" => return Err("email delivery is disabled".to_owned()),
        _ => return Err("unsupported email provider".to_owned()),
    };

    let verification_url =
        build_verification_url(&verification_base_url, token);
    let message = format!(
        "From: {}\nTo: {recipient}\nSubject: Verify your DaggerAdventure email\n\nVerify your email by opening:\n{verification_url}\n\nThis link expires in one hour and can only be used once.\n\n",
        email_from
    );
    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .await
        .map_err(|error| error.to_string())?;
    file.write_all(message.as_bytes())
        .await
        .map_err(|error| error.to_string())
}

fn build_verification_url(base_url: &str, token: &str) -> String {
    format!("{}#token={token}", base_url.trim_end_matches('?'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn disabled_provider_does_not_claim_delivery() {
        let config = Config {
            database_url: String::new(),
            jwt_secret: String::new(),
            cookie_secure: false,
            trust_proxy_headers: false,
            port: 8080,
            admin_email: None,
            email_provider: "disabled".to_owned(),
            email_from: "no-reply@example.com".to_owned(),
            email_dev_outbox: None,
            email_verification_base_url: "http://localhost/verify-email"
                .to_owned(),
            openai_api_key: None,
            openai_model: String::new(),
            openai_image_model: String::new(),
        };
        assert!(
            send_verification_email(&config, "user@example.com", "token")
                .await
                .is_err()
        );
    }

    #[test]
    fn verification_links_put_tokens_in_the_fragment() {
        let url = build_verification_url(
            "https://example.com/verify-email",
            "token-value",
        );
        assert_eq!(url, "https://example.com/verify-email#token=token-value");
    }
}
