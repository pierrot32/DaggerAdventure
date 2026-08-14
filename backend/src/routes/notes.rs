use axum::{
    Json,
    extract::{Path, State},
};
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, AdventureNote, CreateNoteRequest, UpdateNoteRequest},
    repository::{adventure_repo, note_repo},
    state::AppState,
};

const MAX_TITLE_LENGTH: usize = 160;
const MAX_BODY_LENGTH: usize = 10_000;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<Vec<AdventureNote>>, AppError> {
    require_creator(&state, &user, adventure_id).await?;
    Ok(Json(
        note_repo::list(&state.db, adventure_id, user.id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
    Json(request): Json<CreateNoteRequest>,
) -> Result<(axum::http::StatusCode, Json<AdventureNote>), AppError> {
    require_creator(&state, &user, adventure_id).await?;
    let (title, body) = validate_note(request.title, request.body)?;
    Ok((
        axum::http::StatusCode::CREATED,
        Json(note_repo::create(&state.db, adventure_id, user.id, &title, &body).await?),
    ))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((adventure_id, note_id)): Path<(Uuid, Uuid)>,
    Json(request): Json<UpdateNoteRequest>,
) -> Result<Json<AdventureNote>, AppError> {
    require_creator(&state, &user, adventure_id).await?;
    let (title, body) = validate_note(request.title, request.body)?;
    note_repo::update(&state.db, adventure_id, note_id, user.id, &title, &body)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Note not found".to_owned()))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((adventure_id, note_id)): Path<(Uuid, Uuid)>,
) -> Result<axum::http::StatusCode, AppError> {
    require_creator(&state, &user, adventure_id).await?;
    if !note_repo::delete(&state.db, adventure_id, note_id, user.id).await? {
        return Err(AppError::NotFound("Note not found".to_owned()));
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub fn validate_note(title: String, body: String) -> Result<(String, String), AppError> {
    let title = title.trim().to_owned();
    let body = body.trim().to_owned();
    if title.is_empty() {
        return Err(AppError::Validation("Note title is required".to_owned()));
    }
    if title.chars().count() > MAX_TITLE_LENGTH {
        return Err(AppError::Validation(
            "Note title must be 160 characters or fewer".to_owned(),
        ));
    }
    if body.is_empty() {
        return Err(AppError::Validation("Note body is required".to_owned()));
    }
    if body.chars().count() > MAX_BODY_LENGTH {
        return Err(AppError::Validation(
            "Note body must be 10000 characters or fewer".to_owned(),
        ));
    }
    Ok((title, body))
}

async fn require_creator(
    state: &AppState,
    user: &crate::models::User,
    adventure_id: Uuid,
) -> Result<(), AppError> {
    require_at_least(user, AccessLevel::AdventureMaker)?;
    if !adventure_repo::is_creator(&state.db, adventure_id, user.id).await? {
        return Err(AppError::Forbidden(
            "Only the adventure GM can manage notes".to_owned(),
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_note;

    #[test]
    fn trims_and_accepts_valid_notes() {
        let note = validate_note("  Plan  ".to_owned(), "  Follow the red road.  ".to_owned())
            .expect("valid note");
        assert_eq!(note, ("Plan".to_owned(), "Follow the red road.".to_owned()));
    }

    #[test]
    fn rejects_empty_and_oversized_note_fields() {
        assert!(validate_note(" ".to_owned(), "body".to_owned()).is_err());
        assert!(validate_note("title".to_owned(), " ".to_owned()).is_err());
        assert!(validate_note("x".repeat(161), "body".to_owned()).is_err());
        assert!(validate_note("title".to_owned(), "x".repeat(10_001)).is_err());
    }
}
