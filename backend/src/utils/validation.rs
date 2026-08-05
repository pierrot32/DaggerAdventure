use crate::error::AppError;

pub fn normalize_email(email: &str) -> Result<String, AppError> {
    let email = email.trim().to_lowercase();
    if !email.contains('@') || email.len() > 254 {
        return Err(AppError::Validation(
            "Enter a valid email address".to_owned(),
        ));
    }
    Ok(email)
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
}
