use backend::{
    models::{LoginRequest, RegisterRequest},
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
