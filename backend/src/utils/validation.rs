use crate::error::AppError;

pub fn normalize_email(email: &str) -> Result<String, AppError> {
    if email.bytes().any(|byte| byte.is_ascii_control()) {
        return Err(AppError::Validation(
            "Enter a valid email address".to_owned(),
        ));
    }
    let email = email.trim().to_lowercase();
    if !email.contains('@') || email.len() > 254 {
        return Err(AppError::Validation(
            "Enter a valid email address".to_owned(),
        ));
    }
    Ok(email)
}

pub fn validate_email_from(value: &str) -> Result<String, AppError> {
    if value.bytes().any(|byte| byte.is_ascii_control()) {
        return Err(AppError::Validation(
            "EMAIL_FROM must be a valid single-line email address".to_owned(),
        ));
    }
    let value = value.trim();
    let valid_shape = value.len() <= 254
        && value.matches('@').count() == 1
        && value.split_once('@').is_some_and(|(local, domain)| {
            !local.is_empty() && !domain.is_empty()
        });
    if value.is_empty()
        || value.chars().any(char::is_whitespace)
        || !valid_shape
    {
        return Err(AppError::Validation(
            "EMAIL_FROM must be a valid single-line email address".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

pub fn validate_verification_base_url(value: &str) -> Result<String, AppError> {
    if value.bytes().any(|byte| byte.is_ascii_control()) {
        return Err(AppError::Validation(
            "EMAIL_VERIFICATION_BASE_URL must be a single-line HTTP(S) URL"
                .to_owned(),
        ));
    }
    let value = value.trim();
    if value.is_empty() || value.chars().any(char::is_whitespace) {
        return Err(AppError::Validation(
            "EMAIL_VERIFICATION_BASE_URL must be a single-line HTTP(S) URL"
                .to_owned(),
        ));
    }

    let parsed = reqwest::Url::parse(value).map_err(|_| {
        AppError::Validation(
            "EMAIL_VERIFICATION_BASE_URL must be a single-line HTTP(S) URL"
                .to_owned(),
        )
    })?;
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none()
        || !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        return Err(AppError::Validation(
            "EMAIL_VERIFICATION_BASE_URL must be a single-line HTTP(S) URL without credentials, query, or fragment".to_owned(),
        ));
    }
    Ok(value.to_owned())
}

pub fn validate_name(name: &str) -> Result<String, AppError> {
    let name = name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::Validation(
            "Name must be between 1 and 80 characters".to_owned(),
        ));
    }
    Ok(name)
}

pub fn validate_password(password: &str) -> Result<(), AppError> {
    if password.chars().count() < 8 {
        return Err(AppError::Validation(
            "Password must be at least 8 characters".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_email_without_at_sign() {
        assert!(normalize_email("not-an-email").is_err());
    }

    #[test]
    fn rejects_email_with_ascii_control_characters() {
        assert!(normalize_email("user\n@example.com").is_err());
        assert!(normalize_email("user\r@example.com").is_err());
        assert!(normalize_email("user\u{0007}@example.com").is_err());
    }

    #[test]
    fn validates_single_line_email_sender() {
        assert_eq!(
            validate_email_from(" no-reply@example.com ").unwrap(),
            "no-reply@example.com"
        );
        assert!(
            validate_email_from("no-reply\nBcc: attacker@example.com").is_err()
        );
        assert!(validate_email_from("not-an-email").is_err());
    }

    #[test]
    fn validates_verification_url_shape() {
        assert!(
            validate_verification_base_url("https://example.com/verify-email")
                .is_ok()
        );
        assert!(validate_verification_base_url("javascript:alert(1)").is_err());
        assert!(
            validate_verification_base_url("https://example.com/verify?x=1")
                .is_err()
        );
        assert!(
            validate_verification_base_url("https://example.com/verify\n")
                .is_err()
        );
    }

    #[test]
    fn normalizes_email_case_and_whitespace() {
        assert_eq!(
            normalize_email(" Ari@Example.com ").unwrap(),
            "ari@example.com"
        );
    }

    #[test]
    fn rejects_short_passwords() {
        assert!(validate_password("short").is_err());
        assert!(validate_password("long-enough").is_ok());
    }

    #[test]
    fn rejects_email_over_max_length() {
        let local = "a".repeat(250);
        let email = format!("{local}@example.com");
        assert!(normalize_email(&email).is_err());
    }

    #[test]
    fn accepts_email_at_max_length() {
        let local = "a".repeat(254 - "@example.com".len());
        let email = format!("{local}@example.com");
        assert_eq!(email.len(), 254);
        assert!(normalize_email(&email).is_ok());
    }

    #[test]
    fn rejects_empty_name() {
        assert!(validate_name("").is_err());
        assert!(validate_name("   ").is_err());
    }

    #[test]
    fn trims_valid_name() {
        assert_eq!(validate_name("  Ari  ").unwrap(), "Ari");
    }

    #[test]
    fn rejects_name_over_max_length() {
        let name = "a".repeat(81);
        assert!(validate_name(&name).is_err());
    }

    #[test]
    fn accepts_name_at_max_length() {
        let name = "a".repeat(80);
        assert!(validate_name(&name).is_ok());
    }

    #[test]
    fn accepts_password_at_min_length() {
        assert!(validate_password("12345678").is_ok());
    }

    #[test]
    fn rejects_password_one_below_min_length() {
        assert!(validate_password("1234567").is_err());
    }
}
