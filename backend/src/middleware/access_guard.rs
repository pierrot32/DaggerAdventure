use crate::{
    error::AppError,
    models::{AccessLevel, User},
};

pub fn require_at_least(user: &User, required: AccessLevel) -> Result<(), AppError> {
    let current = user
        .access_level
        .parse::<AccessLevel>()
        .map_err(|_| AppError::Forbidden("Your account has an invalid access level".to_owned()))?;

    if current.rank() < required.rank() {
        return Err(AppError::Forbidden(
            "You do not have permission for this action".to_owned(),
        ));
    }

    Ok(())
}
