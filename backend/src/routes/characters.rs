use axum::{
    Json,
    extract::{Path, State},
};
use serde::Deserialize;
use serde_json::{Value, json};
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{
        AccessLevel, Character, CreateCharacterRequest, UpdateCharacterAdvancementRequest,
        UpdateCharacterRequest, UpdateCharacterStatsRequest,
    },
    repository::{character_repo, content_repo},
    state::AppState,
    utils::validation,
};

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<Character>>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    Ok(Json(
        character_repo::list_for_user(&state.db, user.id).await?,
    ))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(mut request): Json<CreateCharacterRequest>,
) -> Result<(axum::http::StatusCode, Json<Character>), AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    request.name = validation::validate_name(&request.name)?;
    request.pronouns = request.pronouns.trim().to_owned();
    request.description = request.description.trim().to_owned();
    request.size = request.size.trim().to_owned();
    request.height = request.height.trim().to_owned();
    request.weight = request.weight.trim().to_owned();
    request.eye_color = request.eye_color.trim().to_owned();
    request.hair_color = request.hair_color.trim().to_owned();
    request.skin_color = request.skin_color.trim().to_owned();
    request.look_description = request.look_description.trim().to_owned();
    request.background_story = request.background_story.trim().to_owned();
    request.background_notes = request.background_notes.trim().to_owned();
    if request.pronouns.is_empty() || request.description.is_empty() {
        return Err(AppError::Validation(
            "Pronouns and description are required".to_owned(),
        ));
    }
    if let Some(adventure_id) = request.adventure_id {
        let adventure =
            crate::repository::adventure_repo::find_visible(&state.db, &user, adventure_id)
                .await?
                .ok_or_else(|| {
                    AppError::Forbidden("You must belong to that adventure first".to_owned())
                })?;
        if adventure.creator_id != user.id {
            let is_member = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(
                    SELECT 1 FROM adventure_members
                    WHERE adventure_id = $1 AND user_id = $2 AND status = 'accepted'
                )",
            )
            .bind(adventure_id)
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
            if !is_member {
                return Err(AppError::Forbidden(
                    "You must accept the adventure invitation first".to_owned(),
                ));
            }
        }
    }
    Ok((
        axum::http::StatusCode::CREATED,
        Json(character_repo::create(&state.db, user.id, &request).await?),
    ))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
    Json(mut request): Json<UpdateCharacterRequest>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    request.name = validation::validate_name(&request.name)?;
    request.pronouns = request.pronouns.trim().to_owned();
    request.description = request.description.trim().to_owned();
    request.size = request.size.trim().to_owned();
    request.height = request.height.trim().to_owned();
    request.weight = request.weight.trim().to_owned();
    request.eye_color = request.eye_color.trim().to_owned();
    request.hair_color = request.hair_color.trim().to_owned();
    request.skin_color = request.skin_color.trim().to_owned();
    request.look_description = request.look_description.trim().to_owned();
    request.background_story = request.background_story.trim().to_owned();
    request.background_notes = request.background_notes.trim().to_owned();
    if request.pronouns.is_empty() || request.description.is_empty() {
        return Err(AppError::Validation(
            "Pronouns and description are required".to_owned(),
        ));
    }
    if !request.experiences.is_array()
        || !request.equipment.is_object()
        || !request.family_members.is_array()
    {
        return Err(AppError::Validation(
            "Experiences, equipment, and family members must use valid JSON shapes".to_owned(),
        ));
    }
    character_repo::update(&state.db, user.id, character_id, &request)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}

#[derive(Debug, Deserialize)]
pub struct LinkAdventureRequest {
    pub adventure_id: Option<Uuid>,
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    character_repo::find_visible_to_user(&state.db, user.id, character_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
) -> Result<axum::http::StatusCode, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    if !character_repo::delete_for_user(&state.db, user.id, character_id).await? {
        return Err(AppError::NotFound("Character not found".to_owned()));
    }
    Ok(axum::http::StatusCode::NO_CONTENT)
}

pub async fn update_stats(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
    Json(request): Json<UpdateCharacterStatsRequest>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    if !request.stats.is_object() {
        return Err(AppError::Validation(
            "Character stats must be an object".to_owned(),
        ));
    }
    character_repo::update_stats(&state.db, user.id, character_id, &request.stats)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}

pub async fn advance(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
    Json(request): Json<UpdateCharacterAdvancementRequest>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    if !(2..=10).contains(&request.level) {
        return Err(AppError::Validation(
            "Character level must be between 2 and 10".to_owned(),
        ));
    }
    let character = character_repo::find_for_user(&state.db, user.id, character_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))?;
    if request.level != character.level + 1 {
        return Err(AppError::Validation(format!(
            "Advance one level at a time. This character is level {}",
            character.level
        )));
    }
    let milestone_level = matches!(request.level, 2 | 5 | 8);
    if milestone_level
        && request
            .experience
            .as_deref()
            .unwrap_or("")
            .trim()
            .is_empty()
    {
        return Err(AppError::Validation(
            "Name the additional Experience granted at this level".to_owned(),
        ));
    }
    let choices = request.choices.as_array().ok_or_else(|| {
        AppError::Validation("Advancement choices must be a JSON array".to_owned())
    })?;
    if choices.len() != 2 {
        return Err(AppError::Validation(
            "Choose exactly two advancements for each level".to_owned(),
        ));
    }
    let book = content_repo::find_character_creation_book(&state.db)
        .await?
        .ok_or_else(|| {
            AppError::Validation("No book content is available for domain cards".to_owned())
        })?;
    let class_domain_ids = book
        .content
        .get("classes")
        .and_then(Value::as_array)
        .and_then(|classes| {
            classes.iter().find(|class| {
                class.get("id").and_then(Value::as_str) == Some(character.class_id.as_str())
            })
        })
        .and_then(|class| class.get("domains"))
        .and_then(Value::as_array)
        .map(|domains| domains.iter().filter_map(Value::as_str).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut domain_cards = character.domain_cards.clone();
    let domain_cards_history = domain_cards.as_array_mut().ok_or_else(|| {
        AppError::Validation("Character domain card history is invalid".to_owned())
    })?;
    for choice in choices {
        let id = choice
            .get("id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(|| AppError::Validation("Each advancement needs an id".to_owned()))?;
        if !matches!(
            id,
            "traits"
                | "hit_points"
                | "stress"
                | "experiences"
                | "domain_card"
                | "evasion"
                | "subclass"
                | "proficiency"
                | "multiclass"
        ) {
            return Err(AppError::Validation(
                "Unknown advancement option".to_owned(),
            ));
        }
        if id == "domain_card" {
            let domain_id = choice
                .get("domain_id")
                .and_then(Value::as_str)
                .ok_or_else(|| {
                    AppError::Validation("Choose a domain for the domain card".to_owned())
                })?;
            let card_id = choice
                .get("value")
                .and_then(Value::as_str)
                .ok_or_else(|| AppError::Validation("Choose a domain card".to_owned()))?;
            if !class_domain_ids.iter().any(|item| *item == domain_id) {
                return Err(AppError::Validation(
                    "That domain is not available to this class".to_owned(),
                ));
            }
            let selected_card = find_domain_card(&book.content, domain_id, card_id, request.level)
                .ok_or_else(|| {
                    AppError::Validation(
                        "That domain card is not available at this level".to_owned(),
                    )
                })?;
            let already_owned = domain_cards_history.iter().any(|card| {
                card.get("id").and_then(Value::as_str) == Some(card_id)
                    && card.get("domainId").and_then(Value::as_str) == Some(domain_id)
            });
            if already_owned {
                return Err(AppError::Validation(
                    "That domain card is already on this character".to_owned(),
                ));
            }
            domain_cards_history.push(selected_card);
        }
    }
    let mut advancements = character.advancements.clone();
    let history = advancements.as_array_mut().ok_or_else(|| {
        AppError::Validation("Character advancement history is invalid".to_owned())
    })?;
    history.push(serde_json::json!({
        "level": request.level,
        "choices": request.choices,
        "experience": request.experience.as_ref().map(|value| value.trim().to_owned()),
    }));
    let mut experiences = character.experiences.clone();
    if let Some(experience) = request
        .experience
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        experiences
            .as_array_mut()
            .ok_or_else(|| AppError::Validation("Character Experiences are invalid".to_owned()))?
            .push(serde_json::json!({ "name": experience, "modifier": 2 }));
    }
    character_repo::advance(
        &state.db,
        user.id,
        character_id,
        character.level,
        request.level,
        &advancements,
        &experiences,
        &domain_cards,
    )
    .await?
    .map(Json)
    .ok_or_else(|| AppError::NotFound("Character changed before it could be advanced".to_owned()))
}

fn find_domain_card(book: &Value, domain_id: &str, card_id: &str, max_level: i32) -> Option<Value> {
    let domain = book
        .get("domains")
        .and_then(Value::as_array)?
        .iter()
        .find(|domain| domain.get("id").and_then(Value::as_str) == Some(domain_id))?;
    for level in 1..=max_level {
        let key = format!("level_{level}_cards");
        let Some(cards) = domain.get(&key).and_then(Value::as_array) else {
            continue;
        };
        if let Some(card) = cards
            .iter()
            .find(|card| card.get("id").and_then(Value::as_str) == Some(card_id))
        {
            let mut canonical = card.as_object()?.clone();
            canonical.insert("domainId".to_owned(), json!(domain_id));
            canonical.insert(
                "domain".to_owned(),
                domain
                    .get("name")
                    .cloned()
                    .unwrap_or(Value::String(domain_id.to_owned())),
            );
            canonical.insert("level".to_owned(), json!(level));
            return Some(Value::Object(canonical));
        }
    }
    None
}

pub async fn link_adventure(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(character_id): Path<Uuid>,
    Json(request): Json<LinkAdventureRequest>,
) -> Result<Json<Character>, AppError> {
    require_at_least(&user, AccessLevel::PlayerOnly)?;
    if let Some(adventure_id) = request.adventure_id {
        let adventure =
            crate::repository::adventure_repo::find_visible(&state.db, &user, adventure_id)
                .await?
                .ok_or_else(|| {
                    AppError::Forbidden("You must belong to that adventure first".to_owned())
                })?;
        if adventure.creator_id != user.id {
            let is_member = sqlx::query_scalar::<_, bool>(
                "SELECT EXISTS(SELECT 1 FROM adventure_members WHERE adventure_id = $1 AND user_id = $2 AND status = 'accepted')",
            )
            .bind(adventure_id)
            .bind(user.id)
            .fetch_one(&state.db)
            .await?;
            if !is_member {
                return Err(AppError::Forbidden(
                    "You must belong to that adventure first".to_owned(),
                ));
            }
        }
    }
    character_repo::link_to_adventure(&state.db, user.id, character_id, request.adventure_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Character not found".to_owned()))
}
