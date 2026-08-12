#[allow(dead_code)]
mod common;

use backend::{
    models::User,
    repository::{adventure_repo, frame_repo, user_repo},
};
use common::fixtures::{admin_user, player_user};
use serde_json::json;

async fn load_user(pool: &sqlx::PgPool, id: uuid::Uuid) -> User {
    user_repo::find_by_id(pool, id)
        .await
        .expect("user lookup should succeed")
        .expect("fixture user should exist")
}

fn frame_content(pitch: &str) -> serde_json::Value {
    json!({
        "id": "test-frame",
        "name": "Test Frame",
        "description": "A frame for integration tests",
        "complexity_rating": 3,
        "pitch": pitch,
        "overview": "A contained campaign",
        "modifications": {
            "communities": [{"id": "community-a", "title": "Community A", "description": "A hint"}],
            "ancestries": [],
            "classes": []
        },
        "player_principles": [],
        "gm_principles": [],
        "distinctions": [],
        "campaign_mechanics": [],
        "session_zero_questions": []
    })
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn library_frames_are_private_and_adventure_snapshots_are_isolated(pool: sqlx::PgPool) {
    let owner_result = admin_user(&pool, "test-secret").await;
    let other_result = admin_user(&pool, "test-secret").await;
    let owner = load_user(&pool, owner_result.user.id).await;
    let other = load_user(&pool, other_result.user.id).await;
    let original = frame_content("Original pitch");

    let library = frame_repo::create_library(
        &pool,
        owner.id,
        "Test Frame",
        "A frame for integration tests",
        3,
        &original,
    )
    .await
    .expect("library frame should be created");
    assert!(
        frame_repo::find_library(&pool, owner.id, library.id)
            .await
            .expect("owner lookup should succeed")
            .is_some()
    );
    assert!(
        frame_repo::find_library(&pool, other.id, library.id)
            .await
            .expect("other lookup should succeed")
            .is_none()
    );

    let adventure = adventure_repo::create(&pool, owner.id, "Snapshot Test", None)
        .await
        .expect("adventure should be created");
    let attached = frame_repo::attach(
        &pool,
        &owner,
        adventure.id,
        "library",
        Some(&library.id.to_string()),
        &original,
    )
    .await
    .expect("adventure frame should be attached");
    assert_eq!(attached.content["pitch"], "Original pitch");
    assert_eq!(attached.selections["pitch"], true);

    let changed = frame_content("Updated library pitch");
    frame_repo::update_library(
        &pool,
        owner.id,
        library.id,
        "Test Frame",
        "A frame for integration tests",
        3,
        &changed,
    )
    .await
    .expect("library frame should update");
    let snapshot = frame_repo::find_for_user(&pool, &owner, adventure.id)
        .await
        .expect("snapshot lookup should succeed")
        .expect("owner should see the snapshot");
    assert_eq!(snapshot.content["pitch"], "Original pitch");
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn pending_invitees_cannot_read_frames_until_accepting_membership(pool: sqlx::PgPool) {
    let owner_result = admin_user(&pool, "test-secret").await;
    let member_result = player_user(&pool, "test-secret").await;
    let owner = load_user(&pool, owner_result.user.id).await;
    let member = load_user(&pool, member_result.user.id).await;
    let adventure = adventure_repo::create(&pool, owner.id, "Visibility Test", None)
        .await
        .expect("adventure should be created");
    frame_repo::attach(
        &pool,
        &owner,
        adventure.id,
        "blank",
        None,
        &frame_content("Member pitch"),
    )
    .await
    .expect("adventure frame should be attached");

    adventure_repo::create_invite(&pool, &owner, adventure.id, &member.email)
        .await
        .expect("invite should be created");
    assert!(
        frame_repo::find_for_user(&pool, &member, adventure.id)
            .await
            .expect("pending visibility lookup should succeed")
            .is_none()
    );

    let invite = sqlx::query_scalar::<_, uuid::Uuid>(
        "SELECT id FROM adventure_invites WHERE adventure_id = $1",
    )
    .bind(adventure.id)
    .fetch_one(&pool)
    .await
    .expect("invite should exist");
    adventure_repo::accept_invite(&pool, &member, invite)
        .await
        .expect("member should accept invite");
    assert!(
        frame_repo::find_for_user(&pool, &member, adventure.id)
            .await
            .expect("accepted visibility lookup should succeed")
            .is_some()
    );
}
