use crate::{
    error::AppError,
    models::{AccessLevel, User},
};

pub fn require_at_least(
    user: &User,
    required: AccessLevel,
) -> Result<(), AppError> {
    let current = user.access_level.parse::<AccessLevel>().map_err(|_| {
        AppError::Forbidden(
            "Your account has an invalid access level".to_owned(),
        )
    })?;

    if current.rank() < required.rank() {
        return Err(AppError::Forbidden(
            "You do not have permission for this action".to_owned(),
        ));
    }

    Ok(())
}

pub fn require_ai_generation(user: &User) -> Result<(), AppError> {
    if user.access_level == AccessLevel::Admin.as_str()
        || user.ai_generation_enabled
    {
        return Ok(());
    }

    Err(AppError::Forbidden(
        "AI generation access has not been enabled for your account".to_owned(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;
    use uuid::Uuid;

    fn user_with_access_level(access_level: &str) -> User {
        User {
            id: Uuid::new_v4(),
            email: "test@example.com".to_owned(),
            name: "Test User".to_owned(),
            password_hash: "unused".to_owned(),
            access_level: access_level.to_owned(),
            ai_generation_enabled: false,
            created_at: Utc::now(),
        }
    }

    #[test]
    fn allows_exact_required_level() {
        let user = user_with_access_level("player_only");
        assert!(require_at_least(&user, AccessLevel::PlayerOnly).is_ok());
    }

    #[test]
    fn allows_higher_than_required_level() {
        let user = user_with_access_level("admin");
        assert!(require_at_least(&user, AccessLevel::PlayerOnly).is_ok());
    }

    #[test]
    fn rejects_lower_than_required_level() {
        let user = user_with_access_level("nothing");
        assert!(require_at_least(&user, AccessLevel::PlayerOnly).is_err());
    }

    #[test]
    fn rejects_invalid_stored_access_level() {
        let user = user_with_access_level("not-a-real-level");
        assert!(require_at_least(&user, AccessLevel::Nothing).is_err());
    }

    #[test]
    fn allows_ai_generation_for_admins() {
        let user = user_with_access_level("admin");
        assert!(require_ai_generation(&user).is_ok());
    }

    #[test]
    fn allows_ai_generation_for_granted_users() {
        let mut user = user_with_access_level("player_only");
        user.ai_generation_enabled = true;
        assert!(require_ai_generation(&user).is_ok());
    }

    #[test]
    fn rejects_ai_generation_without_grant() {
        let user = user_with_access_level("player_only");
        assert!(require_ai_generation(&user).is_err());
    }
}
