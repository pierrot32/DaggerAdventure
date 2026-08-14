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
        AccessLevel, Character, CharacterSummary, CreateCharacterRequest,
        UpdateCharacterAdvancementRequest, UpdateCharacterRequest, UpdateCharacterStatsRequest,
    },
    repository::{character_repo, content_repo},
    state::AppState,
    utils::validation,
};

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<CharacterSummary>>, AppError> {
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
    request.birth_city = request.birth_city.trim().to_owned();
    if request.birth_city.chars().count() > 160 {
        return Err(AppError::Validation(
            "Birth city must be 160 characters or fewer".to_owned(),
        ));
    }
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
    request.birth_city = request
        .birth_city
        .map(|birth_city| birth_city.trim().to_owned());
    if request
        .birth_city
        .as_ref()
        .is_some_and(|birth_city| birth_city.chars().count() > 160)
    {
        return Err(AppError::Validation(
            "Birth city must be 160 characters or fewer".to_owned(),
        ));
    }
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
    validate_advancement_choices(choices, request.level)?;
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
        .map(|domains| {
            domains
                .iter()
                .filter_map(Value::as_str)
                .map(str::to_owned)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let mut domain_cards = character.domain_cards.clone();
    let selected_domain_card = validate_domain_card_choice(
        choices,
        &book.content,
        &class_domain_ids,
        &domain_cards,
        request.level,
    )?;
    let domain_cards_history = domain_cards.as_array_mut().ok_or_else(|| {
        AppError::Validation("Character domain card history is invalid".to_owned())
    })?;
    domain_cards_history.push(selected_domain_card);
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

fn tier_for_level(level: i32) -> i32 {
    if level >= 8 {
        4
    } else if level >= 5 {
        3
    } else if level >= 2 {
        2
    } else {
        1
    }
}

fn validate_advancement_choices(choices: &[Value], level: i32) -> Result<(), AppError> {
    for choice in choices {
        let id = choice
            .get("id")
            .and_then(Value::as_str)
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
        if matches!(id, "subclass" | "proficiency" | "multiclass") && tier_for_level(level) < 3 {
            return Err(AppError::Validation(
                "Subclass, proficiency, and multiclass advancements require tier 3".to_owned(),
            ));
        }
    }
    Ok(())
}

fn validate_domain_card_choice(
    choices: &[Value],
    book: &Value,
    class_domain_ids: &[String],
    owned_cards: &Value,
    max_level: i32,
) -> Result<Value, AppError> {
    let domain_choices = choices
        .iter()
        .filter(|choice| choice.get("id").and_then(Value::as_str) == Some("domain_card"))
        .collect::<Vec<_>>();
    if domain_choices.len() != 1 {
        return Err(AppError::Validation(
            "Choose exactly one domain card as one of your two advancements".to_owned(),
        ));
    }
    let choice = domain_choices[0];
    let domain_id = choice
        .get("domain_id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Validation("Choose a domain for the domain card".to_owned()))?;
    let card_id = choice
        .get("value")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::Validation("Choose a domain card".to_owned()))?;
    if !class_domain_ids.iter().any(|item| item == domain_id) {
        return Err(AppError::Validation(
            "That domain is not available to this class".to_owned(),
        ));
    }
    let selected_card = find_domain_card(book, domain_id, card_id, max_level).ok_or_else(|| {
        AppError::Validation("That domain card is not available at this level".to_owned())
    })?;
    let owned_cards = owned_cards.as_array().ok_or_else(|| {
        AppError::Validation("Character domain card history is invalid".to_owned())
    })?;
    if owned_cards.iter().any(|card| {
        card.get("id").and_then(Value::as_str) == Some(card_id)
            && card
                .get("domainId")
                .or_else(|| card.get("domain_id"))
                .and_then(Value::as_str)
                == Some(domain_id)
    }) {
        return Err(AppError::Validation(
            "That domain card is already on this character".to_owned(),
        ));
    }
    Ok(selected_card)
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

#[cfg(test)]
mod tests {
    use super::{tier_for_level, validate_advancement_choices, validate_domain_card_choice};
    use serde_json::{Value, json};

    fn test_book() -> Value {
        json!({
            "domains": [{
                "id": "arcana",
                "name": "Arcana",
                "level_1_cards": [{"id": "spell-ward", "name": "Spell Ward"}],
                "level_3_cards": [{"id": "astral-step", "name": "Astral Step"}]
            }]
        })
    }

    fn card_choice(domain_id: &str, card_id: &str) -> Value {
        json!({"id": "domain_card", "domain_id": domain_id, "value": card_id})
    }

    #[test]
    fn rejects_tier_three_advancements_before_tier_three() {
        for id in ["subclass", "proficiency", "multiclass"] {
            let error =
                validate_advancement_choices(&[json!({"id": id}), json!({"id": "domain_card"})], 4)
                    .expect_err("tier-three advancements should be rejected at level 4");

            assert!(
                matches!(error, crate::error::AppError::Validation(message) if message.contains("require tier 3"))
            );
        }
    }

    #[test]
    fn allows_tier_three_advancements_at_tier_three() {
        assert_eq!(tier_for_level(5), 3);

        for id in ["subclass", "proficiency", "multiclass"] {
            validate_advancement_choices(&[json!({"id": id}), json!({"id": "domain_card"})], 5)
                .expect("tier-three advancements should be accepted at level 5");
        }
    }

    #[test]
    fn requires_one_domain_card_choice() {
        let error = validate_domain_card_choice(
            &[json!({"id": "evasion"}), json!({"id": "stress"})],
            &test_book(),
            &["arcana".to_owned()],
            &json!([]),
            2,
        )
        .expect_err("a level-up without a domain card should fail");

        assert!(
            matches!(error, crate::error::AppError::Validation(message) if message.contains("exactly one domain card"))
        );
    }

    #[test]
    fn rejects_domain_card_outside_class_domains() {
        let error = validate_domain_card_choice(
            &[
                card_choice("arcana", "spell-ward"),
                json!({"id": "evasion"}),
            ],
            &test_book(),
            &["bone".to_owned()],
            &json!([]),
            2,
        )
        .expect_err("a card from another class domain should fail");

        assert!(
            matches!(error, crate::error::AppError::Validation(message) if message.contains("not available to this class"))
        );
    }

    #[test]
    fn rejects_domain_card_above_new_level() {
        let error = validate_domain_card_choice(
            &[
                card_choice("arcana", "astral-step"),
                json!({"id": "evasion"}),
            ],
            &test_book(),
            &["arcana".to_owned()],
            &json!([]),
            2,
        )
        .expect_err("a card above the new level should fail");

        assert!(
            matches!(error, crate::error::AppError::Validation(message) if message.contains("not available at this level"))
        );
    }

    #[test]
    fn rejects_owned_domain_card() {
        let error = validate_domain_card_choice(
            &[
                card_choice("arcana", "spell-ward"),
                json!({"id": "evasion"}),
            ],
            &test_book(),
            &["arcana".to_owned()],
            &json!([{"id": "spell-ward", "domainId": "arcana"}]),
            2,
        )
        .expect_err("an owned card should fail");

        assert!(
            matches!(error, crate::error::AppError::Validation(message) if message.contains("already on this character"))
        );
    }

    #[test]
    fn rejects_legacy_owned_domain_card() {
        let error = validate_domain_card_choice(
            &[
                card_choice("arcana", "spell-ward"),
                json!({"id": "evasion"}),
            ],
            &test_book(),
            &["arcana".to_owned()],
            &json!([{"id": "spell-ward", "domain_id": "arcana"}]),
            2,
        )
        .expect_err("a legacy owned card should fail");

        assert!(
            matches!(error, crate::error::AppError::Validation(message) if message.contains("already on this character"))
        );
    }
}
