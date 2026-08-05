use backend::{
    models::{AccessLevel, LoginRequest, RegisterRequest},
    repository::{admin_repo, adventure_repo, notification_repo, user_repo},
    services::auth_service,
};
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

#[tokio::test]
#[ignore = "requires DATABASE_URL pointing at a disposable Postgres database"]
async fn register_then_login_succeeds() {
    let pool = test_pool().await;
    let jwt_secret = "test-secret";
    let email = format!("{}@example.com", uuid::Uuid::new_v4());

    let registered = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: email.clone(),
            name: "Test Adventurer".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("registration should succeed");
    assert_eq!(registered.user.email, email);
    assert_eq!(registered.user.access_level, "nothing");

    let logged_in = auth_service::login(
        &pool,
        jwt_secret,
        LoginRequest {
            email,
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("login should succeed");
    assert_eq!(logged_in.user.id, registered.user.id);
}

#[tokio::test]
#[ignore = "requires DATABASE_URL pointing at a disposable Postgres database"]
async fn login_with_wrong_password_is_rejected() {
    let pool = test_pool().await;
    let jwt_secret = "test-secret";
    let email = format!("{}@example.com", uuid::Uuid::new_v4());

    auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: email.clone(),
            name: "Test Adventurer".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("registration should succeed");

    let result = auth_service::login(
        &pool,
        jwt_secret,
        LoginRequest {
            email,
            password: "wrong-password".to_owned(),
        },
    )
    .await;

    assert!(result.is_err());
}

#[tokio::test]
#[ignore = "requires DATABASE_URL pointing at a disposable Postgres database"]
async fn duplicate_email_registration_is_rejected() {
    let pool = test_pool().await;
    let jwt_secret = "test-secret";
    let email = format!("{}@example.com", uuid::Uuid::new_v4());

    auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: email.clone(),
            name: "Test Adventurer".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("first registration should succeed");

    let result = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email,
            name: "Someone Else".to_owned(),
            password: "another-password".to_owned(),
        },
    )
    .await;

    assert!(result.is_err(), "second registration should be rejected");
}

#[tokio::test]
#[ignore = "requires DATABASE_URL pointing at a disposable Postgres database"]
async fn admin_grants_access_and_invitation_workflow_succeeds() {
    let pool = test_pool().await;
    let jwt_secret = "test-secret";
    let admin_email = format!("admin-{}@example.com", uuid::Uuid::new_v4());
    let maker_email = format!("maker-{}@example.com", uuid::Uuid::new_v4());
    let invited_email = format!("invited-{}@example.com", uuid::Uuid::new_v4());

    let admin_response = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: admin_email,
            name: "Admin User".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("admin registration should succeed");
    sqlx::query("UPDATE users SET access_level = 'admin' WHERE id = $1")
        .bind(admin_response.user.id)
        .execute(&pool)
        .await
        .expect("admin bootstrap should succeed");

    let maker_response = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: maker_email,
            name: "Adventure Maker".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("maker registration should succeed");
    let admin = user_repo::find_by_id(&pool, admin_response.user.id)
        .await
        .expect("admin lookup should succeed")
        .expect("admin should exist");
    admin_repo::update_access_level(
        &pool,
        &admin,
        maker_response.user.id,
        AccessLevel::AdventureMaker,
    )
    .await
    .expect("admin grant should succeed");

    let maker = user_repo::find_by_id(&pool, maker_response.user.id)
        .await
        .expect("maker lookup should succeed")
        .expect("maker should exist");
    let adventure = adventure_repo::create(
        &pool,
        maker.id,
        "The Lost Temple",
        Some("A private test adventure"),
    )
    .await
    .expect("maker should create an adventure");
    let invite = adventure_repo::create_invite(&pool, &maker, adventure.id, &invited_email)
        .await
        .expect("maker should create an invite");

    let invited_response = auth_service::register(
        &pool,
        jwt_secret,
        RegisterRequest {
            email: invited_email,
            name: "Invited Player".to_owned(),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("invited registration should succeed");
    assert_eq!(invited_response.user.access_level, "nothing");
    let invited = user_repo::find_by_id(&pool, invited_response.user.id)
        .await
        .expect("invited user lookup should succeed")
        .expect("invited user should exist");
    let notifications = notification_repo::list_for_user(&pool, invited.id)
        .await
        .expect("notification lookup should succeed");
    assert_eq!(notifications.len(), 1);

    admin_repo::update_access_level(&pool, &admin, invited.id, AccessLevel::PlayerOnly)
        .await
        .expect("admin player grant should succeed");
    let accepted = adventure_repo::accept_invite(&pool, &invited, invite.id)
        .await
        .expect("player should accept their invitation");
    assert_eq!(accepted.status, "accepted");
}
