use backend::{
    models::{AccessLevel, LoginRequest, RegisterRequest},
    repository::{admin_repo, adventure_repo, notification_repo, user_repo},
    services::auth_service,
};

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn register_then_login_succeeds(pool: sqlx::PgPool) {
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

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn login_with_wrong_password_is_rejected(pool: sqlx::PgPool) {
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

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn duplicate_email_registration_is_rejected(pool: sqlx::PgPool) {
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

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn admin_grants_access_and_invitation_workflow_succeeds(pool: sqlx::PgPool) {
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

/// A freshly registered invitee still has the `nothing` access level, so the invite
/// inbox and the accept/decline actions must not be gated behind `player_only`.
#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn invitee_without_access_level_can_list_and_accept_invites(pool: sqlx::PgPool) {
    let jwt_secret = "test-secret";
    let maker = register_with_level(&pool, jwt_secret, "maker", AccessLevel::AdventureMaker).await;
    let invited_email = format!("invited-{}@example.com", uuid::Uuid::new_v4());

    let adventure = adventure_repo::create(&pool, maker.id, "Fear Test Table", None)
        .await
        .expect("maker should create an adventure");
    adventure_repo::create_invite(&pool, &maker, adventure.id, &invited_email)
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
    let invited = user_repo::find_by_id(&pool, invited_response.user.id)
        .await
        .expect("invited lookup should succeed")
        .expect("invited should exist");
    assert_eq!(invited.access_level, "nothing");

    let pending = adventure_repo::list_pending_for_user(&pool, &invited)
        .await
        .expect("pending invite lookup should succeed");
    assert_eq!(pending.len(), 1);
    assert_eq!(pending[0].adventure_name, "Fear Test Table");
    assert_eq!(pending[0].inviter_name, maker.name);

    let accepted = adventure_repo::accept_invite(&pool, &invited, pending[0].id)
        .await
        .expect("invitee should accept without a prior access grant");
    assert_eq!(accepted.status, "accepted");

    let still_pending = adventure_repo::list_pending_for_user(&pool, &invited)
        .await
        .expect("pending invite lookup should succeed");
    assert!(
        still_pending.is_empty(),
        "an answered invite must leave the inbox"
    );
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn invitee_can_decline_and_only_gm_moves_the_fear_pool(pool: sqlx::PgPool) {
    let jwt_secret = "test-secret";
    let maker = register_with_level(&pool, jwt_secret, "maker", AccessLevel::AdventureMaker).await;
    let outsider =
        register_with_level(&pool, jwt_secret, "outsider", AccessLevel::PlayerOnly).await;

    let adventure = adventure_repo::create(&pool, maker.id, "Fear Pool Table", None)
        .await
        .expect("maker should create an adventure");
    assert_eq!(adventure.fear, 0, "a new table starts with no Fear");

    let invite = adventure_repo::create_invite(&pool, &maker, adventure.id, &outsider.email)
        .await
        .expect("maker should create an invite");
    let declined = adventure_repo::decline_invite(&pool, &outsider, invite.id)
        .await
        .expect("invitee should decline their invitation");
    assert_eq!(declined.status, "declined");

    let updated = adventure_repo::update_fear(&pool, &maker, adventure.id, 5)
        .await
        .expect("the GM should move the Fear pool");
    assert_eq!(updated.fear, 5);

    let clamped = adventure_repo::update_fear(&pool, &maker, adventure.id, 99)
        .await
        .expect("out of range Fear should clamp rather than fail");
    assert_eq!(clamped.fear, 12, "Fear caps at 12");

    let forbidden = adventure_repo::update_fear(&pool, &outsider, adventure.id, 1).await;
    assert!(
        forbidden.is_err(),
        "only the adventure creator may change Fear"
    );
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn only_the_adventure_creator_can_delete_and_cascades_related_rows(pool: sqlx::PgPool) {
    let maker =
        register_with_level(&pool, "test-secret", "maker", AccessLevel::AdventureMaker).await;
    let other = register_with_level(&pool, "test-secret", "other", AccessLevel::PlayerOnly).await;
    let adventure = adventure_repo::create(&pool, maker.id, "Delete Test Table", None)
        .await
        .expect("adventure should be created");
    adventure_repo::create_invite(&pool, &maker, adventure.id, &other.email)
        .await
        .expect("invite should be created");

    assert!(
        !adventure_repo::delete_adventure(&pool, &other, adventure.id)
            .await
            .expect("non-creator deletion should be checked")
    );
    assert!(
        adventure_repo::delete_adventure(&pool, &maker, adventure.id)
            .await
            .expect("creator should delete the adventure")
    );

    let adventure_count =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM adventures WHERE id = $1")
            .bind(adventure.id)
            .fetch_one(&pool)
            .await
            .expect("adventure count should be readable");
    let invite_count = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM adventure_invites WHERE adventure_id = $1",
    )
    .bind(adventure.id)
    .fetch_one(&pool)
    .await
    .expect("invite count should be readable");
    assert_eq!(adventure_count, 0);
    assert_eq!(invite_count, 0);
}

/// Registers a user and bumps them straight to `level` using a bootstrapped admin.
async fn register_with_level(
    pool: &sqlx::PgPool,
    jwt_secret: &str,
    prefix: &str,
    level: AccessLevel,
) -> backend::models::User {
    let response = auth_service::register(
        pool,
        jwt_secret,
        RegisterRequest {
            email: format!("{prefix}-{}@example.com", uuid::Uuid::new_v4()),
            name: format!("{prefix} user"),
            password: "correct-horse".to_owned(),
        },
    )
    .await
    .expect("registration should succeed");
    sqlx::query("UPDATE users SET access_level = $1 WHERE id = $2")
        .bind(level.as_str())
        .bind(response.user.id)
        .execute(pool)
        .await
        .expect("access level bootstrap should succeed");
    user_repo::find_by_id(pool, response.user.id)
        .await
        .expect("user lookup should succeed")
        .expect("user should exist")
}
