use axum::{Json, extract::{Path, State}};

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, ImportBookRequest, SourceBook, UpdateBookContentRequest},
    repository::content_repo,
    state::AppState,
};

pub async fn get_character_creation_book(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
) -> Result<Json<SourceBook>, AppError> {
    content_repo::find_character_creation_book(&state.db)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("No Daggerheart book has been imported yet".to_owned()))
}

pub async fn import_book(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Json(request): Json<ImportBookRequest>,
) -> Result<Json<SourceBook>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    if request.id.trim().is_empty()
        || request.title.trim().is_empty()
        || request.version.trim().is_empty()
        || !request.content.is_object()
    {
        return Err(AppError::Validation(
            "A book import needs an id, title, version, and object content".to_owned(),
        ));
    }
    validate_book_content(&request.content)?;
    Ok(Json(content_repo::import_book(&state.db, &request).await?))
}

pub async fn list_books(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Vec<SourceBook>>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    Ok(Json(content_repo::list_books(&state.db).await?))
}

pub async fn update_book_content(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(book_id): Path<String>,
    Json(request): Json<UpdateBookContentRequest>,
) -> Result<Json<SourceBook>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    validate_book_content(&request.content)?;
    content_repo::update_book_content(&state.db, &book_id, &request.content)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("The requested book was not found".to_owned()))
}

pub async fn export_books(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
) -> Result<Json<Vec<SourceBook>>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    Ok(Json(content_repo::list_books(&state.db).await?))
}

fn validate_book_content(content: &serde_json::Value) -> Result<(), AppError> {
    if !content.is_object() {
        return Err(AppError::Validation("Book content must be a JSON object".to_owned()));
    }
    let has_trait_proposals = content
        .get("character_creation")
        .and_then(|creation| creation.get("trait_proposals"))
        .is_some_and(serde_json::Value::is_object);
    if !has_trait_proposals {
        return Err(AppError::Validation(
            "The book must include character_creation.trait_proposals".to_owned(),
        ));
    }
    let classes = content
        .get("classes")
        .and_then(serde_json::Value::as_array)
        .ok_or_else(|| AppError::Validation("The book must include a classes array".to_owned()))?;
    for class in classes {
        let class_object = class
            .as_object()
            .ok_or_else(|| AppError::Validation("Each class must be a JSON object".to_owned()))?;
        for field in ["id", "name"] {
            if class_object.get(field).and_then(serde_json::Value::as_str).is_none_or(str::is_empty) {
                return Err(AppError::Validation(format!("Each class needs a non-empty {field}")));
            }
        }
        if let Some(subclasses) = class_object.get("subclasses") {
            for subclass in subclasses.as_array().ok_or_else(|| {
                AppError::Validation("A class subclasses field must be an array".to_owned())
            })? {
                let subclass_object = subclass.as_object().ok_or_else(|| {
                    AppError::Validation("Each subclass must be a JSON object".to_owned())
                })?;
                for field in ["id", "name"] {
                    if subclass_object.get(field).and_then(serde_json::Value::as_str).is_none_or(str::is_empty) {
                        return Err(AppError::Validation(format!("Each subclass needs a non-empty {field}")));
                    }
                }
            }
        }
    }
    Ok(())
}
