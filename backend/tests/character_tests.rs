mod common;

use backend::{
    models::{CreateCharacterRequest, LoginRequest, RegisterRequest},
    repository::{adventure_repo, character_repo},
    services::auth_service,
};
use common::fixtures::register_verified;
use serde_json::json;

fn create_character_request(
    adventure_id: Option<uuid::Uuid>,
) -> CreateCharacterRequest {
    CreateCharacterRequest {
        adventure_id,
        stats: json!({}),
        name: "Test Hero".to_owned(),
        pronouns: "they/them".to_owned(),
        description: "A test character".to_owned(),
        size: "Medium".to_owned(),
        height: "5'10\"".to_owned(),
        weight: "165 lb".to_owned(),
        eye_color: "Brown".to_owned(),
        hair_color: "Black".to_owned(),
        skin_color: "Warm brown".to_owned(),
        look_description: "A practical traveling coat".to_owned(),
        class_id: "warrior".to_owned(),
        subclass_id: "vanguard".to_owned(),
        ancestry_id: "human".to_owned(),
        secondary_ancestry_id: None,
        community_id: "wanderborne".to_owned(),
        traits: json!({}),
        experiences: json!([]),
        background_answers: json!([]),
        background_story: String::new(),
        background_notes: String::new(),
        birth_city: String::new(),
        family_members: json!([]),
        connections: json!([]),
        equipment: json!({}),
        domain_cards: json!([]),
    }
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn character_list_returns_only_owner_scoped_summary_fields(
    pool: sqlx::PgPool,
) {
    let jwt_secret = "test-secret";
    let owner = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: format!("owner-{}@example.com", uuid::Uuid::new_v4()),
            name: "Owner".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;
    let outsider = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: format!("outsider-{}@example.com", uuid::Uuid::new_v4()),
            name: "Outsider".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;

    let character = character_repo::create(
        &pool,
        owner.user.id,
        &create_character_request(None),
    )
    .await
    .expect("character creation should succeed");

    let summaries = character_repo::list_for_user(&pool, owner.user.id)
        .await
        .expect("character list should succeed");
    assert_eq!(summaries.len(), 1);
    assert_eq!(
        serde_json::to_value(&summaries[0]).expect("summary should serialize"),
        json!({
            "id": character.id,
            "name": "Test Hero",
            "level": 1,
            "class_id": "warrior",
            "ancestry_id": "human",
            "community_id": "wanderborne"
        })
    );

    let outsider_summaries =
        character_repo::list_for_user(&pool, outsider.user.id)
            .await
            .expect("outsider list should succeed");
    assert!(outsider_summaries.is_empty());
}

/// The sheet trackers (HP, stress, hope, armor, gold) round-trip through `stats`,
/// and only the character's owner may write them.
#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn only_the_owner_can_persist_sheet_trackers(pool: sqlx::PgPool) {
    let jwt_secret = "test-secret";

    let owner = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: format!("owner-{}@example.com", uuid::Uuid::new_v4()),
            name: "Owner".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;
    let outsider = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: format!("outsider-{}@example.com", uuid::Uuid::new_v4()),
            name: "Outsider".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;

    let character = character_repo::create(
        &pool,
        owner.user.id,
        &create_character_request(None),
    )
    .await
    .expect("character creation should succeed");

    let trackers = json!({
        "hit_points": { "current": 3, "max": 6 },
        "stress": { "current": 2, "max": 6 },
        "hope": { "current": 5, "max": 6 },
        "armor": { "current": 1, "max": 3 },
        "gold": { "handfuls": 4, "bags": 2, "chest": 1 },
    });
    let updated = character_repo::update_stats(
        &pool,
        owner.user.id,
        character.id,
        &trackers,
    )
    .await
    .expect("stats update should succeed")
    .expect("owner should be able to update their own sheet");
    assert_eq!(updated.stats["hit_points"]["current"], 3);
    assert_eq!(updated.stats["hope"]["current"], 5);
    assert_eq!(updated.stats["gold"]["bags"], 2);

    let reloaded =
        character_repo::find_for_user(&pool, owner.user.id, character.id)
            .await
            .expect("reload should succeed")
            .expect("character should still exist");
    assert_eq!(reloaded.stats, trackers, "trackers must survive a reload");

    let blocked = character_repo::update_stats(
        &pool,
        outsider.user.id,
        character.id,
        &json!({"hope": 0}),
    )
    .await
    .expect("query should run");
    assert!(
        blocked.is_none(),
        "a non-owner must not be able to write another player's trackers"
    );
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn owner_creator_and_unrelated_user_visibility(pool: sqlx::PgPool) {
    let jwt_secret = "test-secret";

    let owner_email = format!("owner-{}@example.com", uuid::Uuid::new_v4());
    let creator_email = format!("creator-{}@example.com", uuid::Uuid::new_v4());
    let outsider_email =
        format!("outsider-{}@example.com", uuid::Uuid::new_v4());

    let owner = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: owner_email.clone(),
            name: "Owner".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;

    let creator = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: creator_email,
            name: "Creator".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;

    let outsider = register_verified(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: outsider_email,
            name: "Outsider".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await;

    let adventure =
        adventure_repo::create(&pool, creator.user.id, "The Lost Temple", None)
            .await
            .expect("adventure creation should succeed");

    let character = character_repo::create(
        &pool,
        owner.user.id,
        &create_character_request(Some(adventure.id)),
    )
    .await
    .expect("character creation should succeed");

    let visible_to_owner = character_repo::find_visible_to_user(
        &pool,
        owner.user.id,
        character.id,
    )
    .await
    .expect("query should not fail for the owner");
    assert!(
        visible_to_owner.is_some(),
        "owner should be able to open their own character"
    );

    let visible_to_creator = character_repo::find_visible_to_user(
        &pool,
        creator.user.id,
        character.id,
    )
    .await
    .expect("query should not fail for the adventure creator");
    assert!(
        visible_to_creator.is_some(),
        "adventure creator should be able to open a linked character"
    );

    let visible_to_outsider = character_repo::find_visible_to_user(
        &pool,
        outsider.user.id,
        character.id,
    )
    .await
    .expect("query should not fail for an unrelated user");
    assert!(
        visible_to_outsider.is_none(),
        "unrelated users should not be able to open the character"
    );

    // sanity check the login flow used to build test users still works
    auth_service::login(
        &pool,
        jwt_secret,
        LoginRequest {
            email: owner_email,
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("owner should be able to log back in");
}
