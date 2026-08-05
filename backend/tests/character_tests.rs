use backend::{
    models::{CreateCharacterRequest, LoginRequest, RegisterRequest},
    repository::{adventure_repo, character_repo},
    services::auth_service,
};
use serde_json::json;
use sqlx::postgres::PgPoolOptions;

async fn test_pool() -> sqlx::PgPool {
    let database_url = std::env::var("DATABASE_URL")
        .expect("set DATABASE_URL to a disposable Postgres database to run this test");
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .expect("unable to connect to test database");
    backend::run_migrations(&pool)
        .await
        .expect("unable to run migrations");
    pool
}

fn create_character_request(adventure_id: Option<uuid::Uuid>) -> CreateCharacterRequest {
    CreateCharacterRequest {
        adventure_id,
        stats: json!({}),
        name: "Test Hero".to_owned(),
        pronouns: "they/them".to_owned(),
        description: "A test character".to_owned(),
        class_id: "warrior".to_owned(),
        subclass_id: "vanguard".to_owned(),
        ancestry_id: "human".to_owned(),
        secondary_ancestry_id: None,
        community_id: "wanderborne".to_owned(),
        traits: json!({}),
        experiences: json!([]),
        background_answers: json!([]),
        connections: json!([]),
        equipment: json!({}),
        domain_cards: json!([]),
    }
}

#[tokio::test]
#[ignore = "requires DATABASE_URL pointing at a disposable Postgres database"]
async fn owner_creator_and_unrelated_user_visibility() {
    let pool = test_pool().await;
    let jwt_secret = "test-secret";

    let owner_email = format!("owner-{}@example.com", uuid::Uuid::new_v4());
    let creator_email = format!("creator-{}@example.com", uuid::Uuid::new_v4());
    let outsider_email = format!("outsider-{}@example.com", uuid::Uuid::new_v4());

    let owner = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: owner_email.clone(),
            name: "Owner".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("owner registration should succeed");

    let creator = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: creator_email,
            name: "Creator".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("creator registration should succeed");

    let outsider = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: outsider_email,
            name: "Outsider".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("outsider registration should succeed");

    let adventure = adventure_repo::create(&pool, creator.user.id, "The Lost Temple", None)
        .await
        .expect("adventure creation should succeed");

    let character = character_repo::create(
        &pool,
        owner.user.id,
        &create_character_request(Some(adventure.id)),
    )
    .await
    .expect("character creation should succeed");

    let visible_to_owner =
        character_repo::find_visible_to_user(&pool, owner.user.id, character.id)
            .await
            .expect("query should not fail for the owner");
    assert!(
        visible_to_owner.is_some(),
        "owner should be able to open their own character"
    );

    let visible_to_creator =
        character_repo::find_visible_to_user(&pool, creator.user.id, character.id)
            .await
            .expect("query should not fail for the adventure creator");
    assert!(
        visible_to_creator.is_some(),
        "adventure creator should be able to open a linked character"
    );

    let visible_to_outsider =
        character_repo::find_visible_to_user(&pool, outsider.user.id, character.id)
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
