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
        AccessLevel, AdventureFrame, AttachAdventureFrameRequest,
        CampaignFrame, CreateCampaignFrameRequest, UpdateAdventureFrameRequest,
        UpdateCampaignFrameRequest,
    },
    repository::{adventure_repo, frame_repo},
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
    let mut frame = frame_repo::find_for_user(&state.db, &user, adventure_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFound("No campaign frame is attached".to_owned())
        })?;
    let is_creator =
        adventure_repo::is_creator(&state.db, adventure_id, user.id).await?;
    if !can_view_unfiltered_content(is_creator) {
        frame.content = filter_content(&frame.content, &frame.selections);
    }
    Ok(Json(frame))
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
    .ok_or_else(|| {
        AppError::NotFound("No campaign frame is attached".to_owned())
    })
}

pub async fn character_context(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(adventure_id): Path<Uuid>,
) -> Result<Json<Value>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    let frame = frame_repo::find_for_user(&state.db, &user, adventure_id)
        .await?
        .ok_or_else(|| {
            AppError::NotFound("No campaign frame is attached".to_owned())
        })?;
    let filtered_content = filter_content(&frame.content, &frame.selections);
    Ok(Json(json!({
        "content": player_character_context(&filtered_content),
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
                    AppError::Validation(
                        "A built-in frame needs a source id".to_owned(),
                    )
                })?;
            let content = frame_repo::find_builtin(&state.db, id)
                .await?
                .ok_or_else(|| {
                    AppError::NotFound(
                        "Built-in campaign frame not found".to_owned(),
                    )
                })?;
            validate_frame_content(&content)?;
            Ok(("builtin".to_owned(), Some(id.to_owned()), content))
        }
        "library" => {
            let id = source_id
                .and_then(|value| Uuid::parse_str(value).ok())
                .ok_or_else(|| {
                    AppError::Validation(
                        "A library frame needs a valid source id".to_owned(),
                    )
                })?;
            let frame = frame_repo::find_library(&state.db, user.id, id)
                .await?
                .ok_or_else(|| {
                    AppError::NotFound(
                        "Library campaign frame not found".to_owned(),
                    )
                })?;
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
        "gm_messages": {
            "pitch": "",
            "tone_and_feel": "",
            "themes": "",
            "touchstones": "",
            "overview": "",
            "modifications": "",
            "communities": "",
            "ancestries": "",
            "classes": "",
            "player_principles": "",
            "gm_principles": "",
            "distinctions": "",
            "inciting_incident": "",
            "campaign_mechanics": "",
            "session_zero_questions": ""
        },
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
        AppError::Validation(
            "Campaign frame content must be a JSON object".to_owned(),
        )
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
        && (!complexity.is_i64()
            || !(1..=5).contains(&complexity.as_i64().unwrap_or_default()))
    {
        return Err(AppError::Validation(
            "Campaign frame complexity must be between 1 and 5".to_owned(),
        ));
    }
    if let Some(modifications) = object.get("modifications") {
        let modifications = modifications.as_object().ok_or_else(|| {
            AppError::Validation(
                "Frame modifications must be a JSON object".to_owned(),
            )
        })?;
        for kind in ["communities", "ancestries", "classes"] {
            if let Some(entries) = modifications.get(kind) {
                validate_entries(entries, &format!("modifications.{kind}"))?;
            }
        }
    }
    if let Some(messages) = object.get("gm_messages") {
        let messages = messages.as_object().ok_or_else(|| {
            AppError::Validation(
                "Frame GM messages must be a JSON object".to_owned(),
            )
        })?;
        if messages.values().any(|message| !message.is_string()) {
            return Err(AppError::Validation(
                "Each frame GM message must be a string".to_owned(),
            ));
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
            || !questions.as_array().is_some_and(|items| {
                items.iter().all(|item| {
                    item.is_string()
                        || (item
                            .get("id")
                            .and_then(Value::as_str)
                            .is_some_and(|id| !id.is_empty())
                            && item
                                .get("description")
                                .and_then(Value::as_str)
                                .is_some_and(|description| {
                                    !description.is_empty()
                                }))
                })
            }))
    {
        return Err(AppError::Validation(
            "Session-zero questions must be an array of strings".to_owned(),
        ));
    }
    Ok(())
}

fn validate_entries(value: &Value, field: &str) -> Result<(), AppError> {
    let mut ids = std::collections::HashSet::new();
    match value {
        Value::Array(entries) => {
            for entry in entries {
                validate_entry(entry, field, None, &mut ids)?;
            }
        }
        Value::Object(entries) => {
            for (map_key, entry) in entries {
                validate_entry(entry, field, Some(map_key), &mut ids)?;
            }
        }
        _ => {
            return Err(AppError::Validation(format!(
                "{field} must be an array or object map"
            )));
        }
    }
    Ok(())
}

fn validate_entry(
    entry: &Value,
    field: &str,
    map_key: Option<&str>,
    ids: &mut std::collections::HashSet<String>,
) -> Result<(), AppError> {
    let object = entry.as_object().ok_or_else(|| {
        AppError::Validation(format!("Each {field} entry must be an object"))
    })?;
    for required in ["title", "description"] {
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
    let id = object
        .get("id")
        .map(|value| value.as_str().unwrap_or_default())
        .unwrap_or_else(|| map_key.unwrap_or_default());
    if id.is_empty() {
        return Err(AppError::Validation(format!(
            "Each {field} entry needs a non-empty id"
        )));
    }
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
    if let Some(target_ids) = object.get("target_ids")
        && (!target_ids.is_array()
            || !target_ids
                .as_array()
                .is_some_and(|items| items.iter().all(Value::is_string)))
    {
        return Err(AppError::Validation(format!(
            "Target IDs in {field} must be an array of strings"
        )));
    }
    if let Some(gm_message) = object.get("gm_message")
        && !gm_message.is_string()
    {
        return Err(AppError::Validation(format!(
            "GM messages in {field} must be strings"
        )));
    }
    Ok(())
}

pub fn filter_content(content: &Value, selections: &Value) -> Value {
    let Some(content_object) = content.as_object() else {
        return content.clone();
    };
    let Some(selection_object) = selections.as_object() else {
        let mut filtered = content.clone();
        strip_gm_only(&mut filtered);
        return filtered;
    };
    let mut filtered = Map::new();
    for (key, value) in content_object {
        let entry_section_key = format!("{key}_section");
        if selection_object
            .get(&entry_section_key)
            .and_then(Value::as_bool)
            == Some(false)
        {
            continue;
        }
        if key == "modifications" {
            if selection_object.get(key).and_then(Value::as_bool) == Some(false)
            {
                continue;
            }
            filtered.insert(
                key.clone(),
                filter_modifications(value, selection_object),
            );
        } else if let Some(entry_selections) =
            selection_object.get(key).and_then(Value::as_object)
        {
            filtered.insert(
                key.clone(),
                filter_entries(value, entry_selections, key),
            );
        } else if selection_object.get(key).and_then(Value::as_bool)
            != Some(false)
        {
            filtered.insert(key.clone(), value.clone());
        }
    }
    let mut filtered = Value::Object(filtered);
    strip_gm_only(&mut filtered);
    filtered
}

fn filter_entries(
    value: &Value,
    selections: &Map<String, Value>,
    field: &str,
) -> Value {
    if let Some(entries) = value.as_array() {
        return Value::Array(
            entries
                .iter()
                .enumerate()
                .filter(|(index, entry)| {
                    let explicit_id = entry.get("id").and_then(Value::as_str);
                    let generated_id = generated_entry_id(field, *index);
                    !entry_is_disabled(
                        selections,
                        explicit_id,
                        generated_id.as_deref(),
                        *index,
                    )
                })
                .map(|(_, entry)| entry.clone())
                .collect(),
        );
    }
    if let Some(entries) = value.as_object() {
        return Value::Object(
            entries
                .iter()
                .filter(|(map_key, entry)| {
                    let entry_id = entry
                        .get("id")
                        .and_then(Value::as_str)
                        .unwrap_or(map_key);
                    selections.get(*map_key).and_then(Value::as_bool)
                        != Some(false)
                        && selections.get(entry_id).and_then(Value::as_bool)
                            != Some(false)
                })
                .map(|(key, entry)| (key.clone(), entry.clone()))
                .collect(),
        );
    }
    value.clone()
}

fn generated_entry_id(field: &str, index: usize) -> Option<String> {
    let prefix = match field {
        "tone_and_feel" => "tone",
        "themes" => "theme",
        "touchstones" => "touchstone",
        "session_zero_questions" => "session-question",
        _ => return None,
    };
    Some(format!("{prefix}-{}", index + 1))
}

fn entry_is_disabled(
    selections: &Map<String, Value>,
    explicit_id: Option<&str>,
    generated_id: Option<&str>,
    index: usize,
) -> bool {
    let numeric_id = index.to_string();
    [explicit_id, generated_id, Some(numeric_id.as_str())]
        .into_iter()
        .flatten()
        .any(|entry_id| {
            selections.get(entry_id).and_then(Value::as_bool) == Some(false)
        })
}

pub fn player_character_context(content: &Value) -> Value {
    let Some(content_object) = content.as_object() else {
        return Value::Object(Map::new());
    };
    ["name", "pitch", "modifications"]
        .into_iter()
        .filter_map(|key| {
            content_object
                .get(key)
                .map(|value| (key.to_owned(), value.clone()))
        })
        .collect::<Map<_, _>>()
        .into()
}

fn can_view_unfiltered_content(is_creator: bool) -> bool {
    is_creator
}

fn strip_gm_only(value: &mut Value) {
    match value {
        Value::Object(object) => {
            object.remove("gm_message");
            object.remove("gm_messages");
            for child in object.values_mut() {
                strip_gm_only(child);
            }
        }
        Value::Array(items) => {
            for item in items {
                strip_gm_only(item);
            }
        }
        _ => {}
    }
}

fn filter_modifications(
    value: &Value,
    selections: &Map<String, Value>,
) -> Value {
    let Some(modifications) = value.as_object() else {
        return value.clone();
    };
    let mut filtered = Map::new();
    for (kind, entries) in modifications {
        let Some(selected) = selections.get(kind).and_then(Value::as_object)
        else {
            filtered.insert(kind.clone(), entries.clone());
            continue;
        };
        let Some(entries_array) = entries.as_array() else {
            let Some(entries_object) = entries.as_object() else {
                filtered.insert(kind.clone(), entries.clone());
                continue;
            };
            let mut filtered_entries = Map::new();
            for (entry_key, entry) in entries_object {
                let entry_id = entry
                    .get("id")
                    .and_then(Value::as_str)
                    .unwrap_or(entry_key);
                let map_key_disabled =
                    selected.get(entry_key).and_then(Value::as_bool)
                        == Some(false);
                let entry_id_disabled =
                    selected.get(entry_id).and_then(Value::as_bool)
                        == Some(false);
                if !map_key_disabled && !entry_id_disabled {
                    filtered_entries.insert(entry_key.clone(), entry.clone());
                }
            }
            filtered.insert(kind.clone(), Value::Object(filtered_entries));
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
    use super::{
        can_view_unfiltered_content, filter_content, player_character_context,
        validate_frame_content,
    };
    use serde_json::json;

    fn valid_frame_with_modifications(
        modifications: serde_json::Value,
    ) -> serde_json::Value {
        json!({
            "id": "test-frame",
            "name": "Test frame",
            "pitch": "A pitch",
            "overview": "An overview",
            "modifications": modifications
        })
    }

    #[test]
    fn validates_object_map_modifications_with_map_key_fallback_ids() {
        let content = valid_frame_with_modifications(json!({
            "communities": {
                "community-a": {"title": "A", "description": "Guidance"},
                "community-b": {"id": "community-b-id", "title": "B", "description": "Guidance"}
            },
            "ancestries": {},
            "classes": {}
        }));

        validate_frame_content(&content)
            .expect("object-map modifications should validate");
    }

    #[test]
    fn rejects_invalid_object_map_modification_values() {
        let content = valid_frame_with_modifications(json!({
            "classes": {"class-a": "not an entry object"}
        }));

        let error = validate_frame_content(&content)
            .expect_err("invalid map value should fail");
        match error {
            crate::error::AppError::Validation(message) => {
                assert!(message.contains(
                    "Each modifications.classes entry must be an object"
                ));
            }
            other => panic!("expected validation error, got {other:?}"),
        }
    }

    #[test]
    fn rejects_duplicate_object_map_modification_ids() {
        let content = valid_frame_with_modifications(json!({
            "classes": {
                "class-a": {"title": "A", "description": "Guidance"},
                "class-b": {"id": "class-a", "title": "B", "description": "Guidance"}
            }
        }));

        let error = validate_frame_content(&content)
            .expect_err("duplicate IDs should fail");
        match error {
            crate::error::AppError::Validation(message) => {
                assert!(
                    message.contains(
                        "Duplicate id class-a in modifications.classes"
                    )
                );
            }
            other => panic!("expected validation error, got {other:?}"),
        }
    }

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
        let filtered =
            filter_content(&content, &json!({"modifications": false}));

        assert!(filtered.get("modifications").is_none());
    }

    #[test]
    fn filters_individual_entries_in_object_map_guidance() {
        let content = json!({
            "modifications": {
                "classes": {
                    "class-a": {"title": "A", "description": "A guidance"},
                    "class-b": {"id": "class-b", "title": "B", "description": "B guidance"}
                }
            }
        });
        let selections = json!({
            "modifications": true,
            "classes": {"class-a": false, "class-b": true}
        });

        let filtered = filter_content(&content, &selections);

        assert_eq!(
            filtered["modifications"]["classes"]
                .as_object()
                .unwrap()
                .len(),
            1
        );
        assert!(
            filtered["modifications"]["classes"]
                .get("class-a")
                .is_none()
        );
        assert_eq!(
            filtered["modifications"]["classes"]["class-b"]["title"],
            "B"
        );
    }

    #[test]
    fn filters_primitive_entries_by_generated_field_ids_and_indexes() {
        let content = json!({
            "tone_and_feel": ["Storm", "Quiet"],
            "themes": ["Duty", "Freedom"],
            "touchstones": ["Myth", "History"],
            "session_zero_questions": ["Question one", "Question two"]
        });
        let selections = json!({
            "tone_and_feel": {"tone-1": false},
            "themes": {"1": false},
            "touchstones": {"touchstone-1": false},
            "session_zero_questions": {"session-question-2": false}
        });

        let filtered = filter_content(&content, &selections);

        assert_eq!(filtered["tone_and_feel"], json!(["Quiet"]));
        assert_eq!(filtered["themes"], json!(["Duty"]));
        assert_eq!(filtered["touchstones"], json!(["History"]));
        assert_eq!(filtered["session_zero_questions"], json!(["Question one"]));
    }

    #[test]
    fn filters_object_map_entries_by_map_key_or_entry_id() {
        let content = json!({
            "modifications": {
                "classes": {
                    "stable-class-key": {"id": "class-id", "title": "Class", "description": "Guidance"}
                }
            }
        });

        for selections in [
            json!({"modifications": true, "classes": {"stable-class-key": false}}),
            json!({"modifications": true, "classes": {"class-id": false}}),
        ] {
            let filtered = filter_content(&content, &selections);
            assert!(
                filtered["modifications"]["classes"]
                    .as_object()
                    .unwrap()
                    .is_empty()
            );
        }

        for selections in [
            json!({"modifications": true, "classes": {"stable-class-key": true}}),
            json!({"modifications": true, "classes": {"class-id": true}}),
            json!({"modifications": true, "classes": {}}),
        ] {
            let filtered = filter_content(&content, &selections);
            assert!(
                filtered["modifications"]["classes"]
                    .get("stable-class-key")
                    .is_some()
            );
        }
    }

    #[test]
    fn strips_gm_only_messages_from_player_context() {
        let content = json!({
            "pitch": "A pitch",
            "gm_messages": {"pitch": "Secret direction"},
            "modifications": {
                "classes": [{
                    "id": "class-a",
                    "title": "A",
                    "description": "Player guidance",
                    "target_ids": ["class-a"],
                    "gm_message": "Secret class direction"
                }]
            }
        });

        let filtered = filter_content(&content, &serde_json::json!({}));

        assert!(filtered.get("gm_messages").is_none());
        assert!(
            filtered["modifications"]["classes"][0]
                .get("gm_message")
                .is_none()
        );
    }

    #[test]
    fn player_character_context_only_keeps_player_contract_sections() {
        let content = json!({
            "name": "The Ash Coast",
            "pitch": "A dangerous frontier",
            "modifications": {"classes": [{"title": "Player guidance"}]},
            "overview": "Player overview",
            "gm_principles": ["GM-only principle"],
            "campaign_mechanics": ["GM-only mechanics"]
        });

        assert_eq!(
            player_character_context(&content),
            json!({
                "name": "The Ash Coast",
                "pitch": "A dangerous frontier",
                "modifications": {"classes": [{"title": "Player guidance"}]}
            })
        );
    }

    #[test]
    fn only_the_adventure_creator_can_view_unfiltered_content() {
        assert!(can_view_unfiltered_content(true));
        assert!(!can_view_unfiltered_content(false));
    }
}
