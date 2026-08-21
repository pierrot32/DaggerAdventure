use std::path::Path;

use lettre::{
    AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    transport::smtp::authentication::Credentials,
};
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
    let dev_file_configured = config.email_provider == "dev_file"
        && outbox_available
        && valid_email_from
        && valid_verification_url;
    let smtp_configured = config.email_provider == "smtp"
        && config
            .email_smtp_host
            .as_deref()
            .is_some_and(|host| !host.trim().is_empty())
        && config
            .email_smtp_username
            .as_deref()
            .is_some_and(|username| !username.trim().is_empty())
        && config
            .email_smtp_password
            .as_deref()
            .is_some_and(|password| !password.is_empty())
        && matches!(config.email_smtp_tls.as_str(), "starttls" | "implicit")
        && valid_email_from
        && valid_verification_url;

    if dev_file_configured || smtp_configured {
        Ok(())
    } else {
        let reason = match config.email_provider.as_str() {
            "dev_file" if !outbox_available => {
                "EMAIL_DEV_OUTBOX is missing or unavailable"
            }
            "dev_file" if !valid_email_from => "EMAIL_FROM is invalid",
            "dev_file" if !valid_verification_url => {
                "EMAIL_VERIFICATION_BASE_URL is invalid"
            }
            "smtp" if !valid_email_from => "EMAIL_FROM is invalid",
            "smtp" if !valid_verification_url => {
                "EMAIL_VERIFICATION_BASE_URL is invalid"
            }
            "smtp"
                if config
                    .email_smtp_host
                    .as_deref()
                    .is_none_or(|host| host.trim().is_empty()) =>
            {
                "EMAIL_SMTP_HOST is missing"
            }
            "smtp"
                if config
                    .email_smtp_username
                    .as_deref()
                    .is_none_or(|username| username.trim().is_empty()) =>
            {
                "EMAIL_SMTP_USERNAME is missing"
            }
            "smtp"
                if config
                    .email_smtp_password
                    .as_deref()
                    .is_none_or(str::is_empty) =>
            {
                "EMAIL_SMTP_PASSWORD is missing"
            }
            "smtp" => "EMAIL_SMTP_TLS must be starttls or implicit",
            "disabled" => "EMAIL_PROVIDER is disabled",
            _ => "EMAIL_PROVIDER is unsupported",
        };
        eprintln!(
            "email delivery unavailable: provider={} reason={reason}",
            config.email_provider
        );
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
    let verification_url =
        build_verification_url(&verification_base_url, token);
    let message_body = format!(
        "Verify your email by opening:\n{verification_url}\n\nThis link expires in one hour and can only be used once.\n\n"
    );
    let message = format!(
        "From: {email_from}\nTo: {recipient}\nSubject: Verify your DaggerAdventure email\n\n{message_body}"
    );
    match config.email_provider.as_str() {
        "dev_file" => {
            let path = config.email_dev_outbox.as_deref().ok_or_else(|| {
                "EMAIL_DEV_OUTBOX is required for dev_file".to_owned()
            })?;
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
        "smtp" => {
            send_smtp(config, &recipient, &email_from, &message_body).await
        }
        "disabled" => Err("email delivery is disabled".to_owned()),
        _ => Err("unsupported email provider".to_owned()),
    }
}

async fn send_smtp(
    config: &Config,
    recipient: &str,
    email_from: &str,
    message: &str,
) -> Result<(), String> {
    let host = config
        .email_smtp_host
        .as_deref()
        .ok_or_else(|| "EMAIL_SMTP_HOST is required for smtp".to_owned())?;
    let username = config
        .email_smtp_username
        .as_deref()
        .ok_or_else(|| "EMAIL_SMTP_USERNAME is required for smtp".to_owned())?;
    let password = config
        .email_smtp_password
        .as_deref()
        .ok_or_else(|| "EMAIL_SMTP_PASSWORD is required for smtp".to_owned())?;
    let email = Message::builder()
        .from(
            email_from
                .parse()
                .map_err(|_| "invalid EMAIL_FROM".to_owned())?,
        )
        .to(recipient
            .parse()
            .map_err(|_| "invalid email recipient".to_owned())?)
        .subject("Verify your DaggerAdventure email")
        .body(message.to_owned())
        .map_err(|error| error.to_string())?;
    let credentials =
        Credentials::new(username.to_owned(), password.to_owned());
    let transport = match config.email_smtp_tls.as_str() {
        "starttls" => {
            AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(host)
                .map_err(|error| error.to_string())?
        }
        "implicit" => AsyncSmtpTransport::<Tokio1Executor>::relay(host)
            .map_err(|error| error.to_string())?,
        _ => {
            return Err(
                "EMAIL_SMTP_TLS must be starttls or implicit".to_owned()
            );
        }
    }
    .port(config.email_smtp_port)
    .credentials(credentials)
    .build();

    transport.send(email).await.map(|_| ()).map_err(|error| {
        eprintln!(
            "email delivery failed: provider=smtp host={host} error={error}"
        );
        error.to_string()
    })
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
            email_smtp_host: None,
            email_smtp_port: 587,
            email_smtp_username: None,
            email_smtp_password: None,
            email_smtp_tls: "starttls".to_owned(),
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
    fn smtp_provider_requires_credentials() {
        let config = Config {
            database_url: String::new(),
            jwt_secret: String::new(),
            cookie_secure: false,
            trust_proxy_headers: false,
            port: 8080,
            admin_email: None,
            email_provider: "smtp".to_owned(),
            email_from: "no-reply@example.com".to_owned(),
            email_dev_outbox: None,
            email_smtp_host: Some("smtp.example.com".to_owned()),
            email_smtp_port: 587,
            email_smtp_username: Some("sender@example.com".to_owned()),
            email_smtp_password: None,
            email_smtp_tls: "starttls".to_owned(),
            email_verification_base_url: "https://example.com/verify-email"
                .to_owned(),
            openai_api_key: None,
            openai_model: String::new(),
            openai_image_model: String::new(),
        };
        assert!(ensure_delivery_available(&config).is_err());
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
