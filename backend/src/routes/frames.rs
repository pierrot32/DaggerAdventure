use axum::{
    Json,
    extract::{Path, State},
};
use serde_json::{Map, Value, json};
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{
        AccessLevel, AdventureFrame, AttachAdventureFrameRequest, CampaignFrame,
        CreateCampaignFrameRequest, UpdateAdventureFrameRequest, UpdateCampaignFrameRequest,
    },
    repository::frame_repo,
    state::AppState,
    utils::validation,
};

pub async fn builtins(
    State(state): State<AppState>,
    AuthUser(_user): AuthUser,
) -> Result<Json<Vec<Value>>, AppError> {
    Ok(Json(frame_repo::list_builtins(&state.db).await?))
}

pub async fn list_library(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<CampaignFrame>>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    Ok(Json(frame_repo::list_library(&state.db, user.id).await?))
}

pub async fn create_library(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(request): Json<CreateCampaignFrameRequest>,
) -> Result<(axum::http::StatusCode, Json<CampaignFrame>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (name, description, complexity) = validate_metadata(
        &request.name,
        &request.description,
        request.complexity_rating,
    )?;
    validate_frame_content(&request.content)?;
    let frame = frame_repo::create_library(
        &state.db,
        user.id,
        &name,
        &description,
        complexity,
        &request.content,
    )
    .await?;
    Ok((axum::http::StatusCode::CREATED, Json(frame)))
}

pub async fn update_library(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(frame_id): Path<Uuid>,
    Json(request): Json<UpdateCampaignFrameRequest>,
) -> Result<Json<CampaignFrame>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (name, description, complexity) = validate_metadata(
        &request.name,
        &request.description,
        request.complexity_rating,
    )?;
    validate_frame_content(&request.content)?;
    frame_repo::update_library(
        &state.db,
        user.id,
        frame_id,
        &name,
        &description,
        complexity,
        &request.content,
    )
    .await?
    .map(Json)
    .ok_or_else(|| AppError::NotFound("Campaign frame not found".to_owned()))
}

pub async fn delete_library(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(frame_id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !frame_repo::delete_library(&state.db, user.id, frame_id).await? {
        return Err(AppError::NotFound("Campaign frame not found".to_owned()));
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn get_adventure_frame(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<AdventureFrame>, AppError> {
    frame_repo::find_for_user(&state.db, &user, adventure_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("No campaign frame is attached".to_owned()))
}

pub async fn attach_adventure_frame(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
    Json(request): Json<AttachAdventureFrameRequest>,
) -> Result<Json<AdventureFrame>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (source_type, source_id, content) = resolve_source(
        &state,
        &user,
        &request.source_type,
        request.source_id.as_deref(),
        request.content.as_ref(),
    )
    .await?;
    frame_repo::attach(
        &state.db,
        &user,
        adventure_id,
        &source_type,
        source_id.as_deref(),
        &content,
    )
    .await
    .map(Json)
}

pub async fn update_adventure_frame(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
    Json(request): Json<UpdateAdventureFrameRequest>,
) -> Result<Json<AdventureFrame>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    validate_frame_content(&request.content)?;
    if !request.selections.is_object() {
        return Err(AppError::Validation(
            "Frame selections must be a JSON object".to_owned(),
        ));
    }
    frame_repo::update_for_owner(
        &state.db,
        &user,
        adventure_id,
        &request.content,
        &request.selections,
    )
    .await?
    .map(Json)
    .ok_or_else(|| AppError::NotFound("No campaign frame is attached".to_owned()))
}

pub async fn character_context(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    let frame = frame_repo::find_for_user(&state.db, &user, adventure_id)
        .await?
        .ok_or_else(|| AppError::NotFound("No campaign frame is attached".to_owned()))?;
    Ok(Json(json!({
        "content": filter_content(&frame.content, &frame.selections),
        "selections": frame.selections,
    })))
}

pub async fn resolve_source(
    state: &AppState,
    user: &crate::models::User,
    source_type: &str,
    source_id: Option<&str>,
    custom_content: Option<&Value>,
) -> Result<(String, Option<String>, Value), AppError> {
    match source_type {
        "blank" => {
            let content = custom_content.cloned().unwrap_or_else(blank_frame);
            validate_frame_content(&content)?;
            Ok(("blank".to_owned(), None, content))
        }
        "builtin" => {
            let id = source_id
                .filter(|value| !value.trim().is_empty())
                .ok_or_else(|| {
                    AppError::Validation("A built-in frame needs a source id".to_owned())
                })?;
            let content = frame_repo::find_builtin(&state.db, id)
                .await?
                .ok_or_else(|| {
                    AppError::NotFound("Built-in campaign frame not found".to_owned())
                })?;
            validate_frame_content(&content)?;
            Ok(("builtin".to_owned(), Some(id.to_owned()), content))
        }
        "library" => {
            let id = source_id
                .and_then(|value| Uuid::parse_str(value).ok())
                .ok_or_else(|| {
                    AppError::Validation("A library frame needs a valid source id".to_owned())
                })?;
            let frame = frame_repo::find_library(&state.db, user.id, id)
                .await?
                .ok_or_else(|| AppError::NotFound("Library campaign frame not found".to_owned()))?;
            validate_frame_content(&frame.content)?;
            Ok(("library".to_owned(), Some(id.to_string()), frame.content))
        }
        _ => Err(AppError::Validation(
            "Frame source must be blank, builtin, or library".to_owned(),
        )),
    }
}

pub fn blank_frame() -> Value {
    json!({
        "id": "custom-frame",
        "name": "Untitled campaign frame",
        "description": "",
        "complexity_rating": 3,
        "pitch": "A campaign shaped by the choices and tensions at this table.",
        "tone_and_feel": [],
        "themes": [],
        "touchstones": [],
        "overview": "Define the setting, pressures, and boundaries that make this campaign distinct.",
        "modifications": {"communities": [], "ancestries": [], "classes": []},
        "player_principles": [],
        "gm_principles": [],
        "distinctions": [],
        "inciting_incident": "",
        "campaign_mechanics": [],
        "session_zero_questions": []
    })
}

fn validate_metadata(
    name: &str,
    description: &str,
    complexity_rating: i32,
) -> Result<(String, String, i32), AppError> {
    let name = validation::validate_name(name)?;
    let description = description.trim().to_owned();
    if description.chars().count() > 2000 {
        return Err(AppError::Validation(
            "Frame description must be 2000 characters or fewer".to_owned(),
        ));
    }
    if !(1..=5).contains(&complexity_rating) {
        return Err(AppError::Validation(
            "Frame complexity must be between 1 and 5".to_owned(),
        ));
    }
    Ok((name, description, complexity_rating))
}

pub fn validate_frame_content(content: &Value) -> Result<(), AppError> {
    let object = content.as_object().ok_or_else(|| {
        AppError::Validation("Campaign frame content must be a JSON object".to_owned())
    })?;
    for field in ["id", "name", "pitch", "overview"] {
        if object
            .get(field)
            .and_then(Value::as_str)
            .is_none_or(str::is_empty)
        {
            return Err(AppError::Validation(format!(
                "Campaign frame content needs a non-empty {field}"
            )));
        }
    }
    if let Some(complexity) = object.get("complexity_rating")
        && (!complexity.is_i64() || !(1..=5).contains(&complexity.as_i64().unwrap_or_default()))
    {
        return Err(AppError::Validation(
            "Campaign frame complexity must be between 1 and 5".to_owned(),
        ));
    }
    if let Some(modifications) = object.get("modifications") {
        let modifications = modifications.as_object().ok_or_else(|| {
            AppError::Validation("Frame modifications must be a JSON object".to_owned())
        })?;
        for kind in ["communities", "ancestries", "classes"] {
            if let Some(entries) = modifications.get(kind) {
                validate_entries(entries, &format!("modifications.{kind}"))?;
            }
        }
    }
    for field in [
        "player_principles",
        "gm_principles",
        "distinctions",
        "campaign_mechanics",
    ] {
        if let Some(entries) = object.get(field) {
            validate_entries(entries, field)?;
        }
    }
    if let Some(questions) = object.get("session_zero_questions")
        && (!questions.is_array()
            || !questions
                .as_array()
                .is_some_and(|items| items.iter().all(Value::is_string)))
    {
        return Err(AppError::Validation(
            "Session-zero questions must be an array of strings".to_owned(),
        ));
    }
    Ok(())
}

fn validate_entries(value: &Value, field: &str) -> Result<(), AppError> {
    let entries = value
        .as_array()
        .ok_or_else(|| AppError::Validation(format!("{field} must be an array")))?;
    let mut ids = std::collections::HashSet::new();
    for entry in entries {
        let object = entry
            .as_object()
            .ok_or_else(|| AppError::Validation(format!("Each {field} entry must be an object")))?;
        for required in ["id", "title", "description"] {
            if object
                .get(required)
                .and_then(Value::as_str)
                .is_none_or(str::is_empty)
            {
                return Err(AppError::Validation(format!(
                    "Each {field} entry needs a non-empty {required}"
                )));
            }
        }
        let id = object.get("id").and_then(Value::as_str).unwrap_or_default();
        if !ids.insert(id.to_owned()) {
            return Err(AppError::Validation(format!(
                "Duplicate id {id} in {field}"
            )));
        }
        if let Some(questions) = object.get("questions")
            && (!questions.is_array()
                || !questions
                    .as_array()
                    .is_some_and(|items| items.iter().all(Value::is_string)))
        {
            return Err(AppError::Validation(format!(
                "Questions in {field} must be an array of strings"
            )));
        }
    }
    Ok(())
}

pub fn filter_content(content: &Value, selections: &Value) -> Value {
    let Some(content_object) = content.as_object() else {
        return content.clone();
    };
    let Some(selection_object) = selections.as_object() else {
        return content.clone();
    };
    let mut filtered = Map::new();
    for (key, value) in content_object {
        if key == "modifications" {
            if selection_object.get(key).and_then(Value::as_bool) == Some(false) {
                continue;
            }
            filtered.insert(key.clone(), filter_modifications(value, selection_object));
        } else if selection_object.get(key).and_then(Value::as_bool) != Some(false) {
            filtered.insert(key.clone(), value.clone());
        }
    }
    Value::Object(filtered)
}

fn filter_modifications(value: &Value, selections: &Map<String, Value>) -> Value {
    let Some(modifications) = value.as_object() else {
        return value.clone();
    };
    let mut filtered = Map::new();
    for (kind, entries) in modifications {
        let Some(selected) = selections.get(kind).and_then(Value::as_object) else {
            filtered.insert(kind.clone(), entries.clone());
            continue;
        };
        let Some(entries_array) = entries.as_array() else {
            filtered.insert(kind.clone(), entries.clone());
            continue;
        };
        filtered.insert(
            kind.clone(),
            Value::Array(
                entries_array
                    .iter()
                    .filter(|entry| {
                        entry
                            .get("id")
                            .and_then(Value::as_str)
                            .and_then(|id| selected.get(id))
                            .and_then(Value::as_bool)
                            != Some(false)
                    })
                    .cloned()
                    .collect(),
            ),
        );
    }
    Value::Object(filtered)
}

#[cfg(test)]
mod tests {
    use super::filter_content;
    use serde_json::json;

    #[test]
    fn filters_disabled_sections_and_individual_guidance_entries() {
        let content = json!({
            "pitch": "A pitch",
            "overview": "An overview",
            "modifications": {
                "communities": [
                    {"id": "community-a", "title": "A", "description": "A guidance"},
                    {"id": "community-b", "title": "B", "description": "B guidance"}
                ]
            }
        });
        let selections = json!({
            "pitch": false,
            "modifications": true,
            "communities": {"community-a": false, "community-b": true}
        });

        let filtered = filter_content(&content, &selections);

        assert!(filtered.get("pitch").is_none());
        assert_eq!(filtered.get("overview"), content.get("overview"));
        assert_eq!(
            filtered["modifications"]["communities"]
                .as_array()
                .expect("filtered communities")
                .len(),
            1
        );
        assert_eq!(
            filtered["modifications"]["communities"][0]["id"],
            "community-b"
        );
    }

    #[test]
    fn filters_the_whole_modifications_section() {
        let content = json!({
            "modifications": {
                "classes": [{"id": "class-a", "title": "A", "description": "A guidance"}]
            }
        });
        let filtered = filter_content(&content, &json!({"modifications": false}));

        assert!(filtered.get("modifications").is_none());
    }
}
