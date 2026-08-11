mod common;

use backend::{models::ImportBookRequest, repository::content_repo};
use common::fixtures::{sample_book, sample_content};
use sqlx::PgPool;

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn import_update_and_reload_preserve_book_content(pool: PgPool) {
    let book_id = format!("test-book-{}", uuid::Uuid::new_v4());
    let request = sample_book(&book_id);
    let imported = content_repo::import_book(&pool, &request)
        .await
        .expect("book import should succeed");
    assert_eq!(imported.id, book_id);
    assert_eq!(imported.content, request.content);

    let updated_content = sample_content("guardian", "warden");
    let updated = content_repo::update_book_content(&pool, &book_id, &updated_content)
        .await
        .expect("book update should succeed")
        .expect("existing book should be updated");
    assert_eq!(updated.content, updated_content);

    let reloaded = content_repo::list_books(&pool)
        .await
        .expect("book listing should succeed");
    assert_eq!(reloaded.len(), 1);
    assert_eq!(reloaded[0].content, updated_content);
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn importing_same_id_replaces_book_metadata_and_content(pool: PgPool) {
    let book_id = format!("test-book-{}", uuid::Uuid::new_v4());
    let first = sample_book(&book_id);
    content_repo::import_book(&pool, &first)
        .await
        .expect("first import should succeed");

    let second = ImportBookRequest {
        title: "Replacement Book".to_owned(),
        version: "test-2".to_owned(),
        source_file: "replacement.json".to_owned(),
        content: sample_content("guardian", "warden"),
        ..first
    };
    let replaced = content_repo::import_book(&pool, &second)
        .await
        .expect("replacement import should succeed");

    assert_eq!(replaced.id, book_id);
    assert_eq!(replaced.title, "Replacement Book");
    assert_eq!(replaced.version, "test-2");
    assert_eq!(replaced.source_file, "replacement.json");
    assert_eq!(replaced.content, second.content);
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn missing_book_update_returns_none(pool: PgPool) {
    let missing = content_repo::update_book_content(
        &pool,
        &format!("missing-{}", uuid::Uuid::new_v4()),
        &sample_content("guardian", "warden"),
    )
    .await
    .expect("missing update query should succeed");

    assert!(missing.is_none());
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn list_books_uses_imported_at_then_id_order(pool: PgPool) {
    let older_id = format!("older-{}", uuid::Uuid::new_v4());
    let newer_id = format!("newer-{}", uuid::Uuid::new_v4());
    content_repo::import_book(&pool, &sample_book(&older_id))
        .await
        .expect("older book import should succeed");
    content_repo::import_book(&pool, &sample_book(&newer_id))
        .await
        .expect("newer book import should succeed");

    sqlx::query(
        "UPDATE source_books SET imported_at = CASE id
         WHEN $1 THEN $2::timestamptz ELSE $3::timestamptz END",
    )
    .bind(&older_id)
    .bind("2026-01-01T00:00:00Z")
    .bind("2026-01-02T00:00:00Z")
    .execute(&pool)
    .await
    .expect("book timestamps should be set");

    let books = content_repo::list_books(&pool)
        .await
        .expect("book listing should succeed");
    assert_eq!(
        books
            .iter()
            .map(|book| book.id.as_str())
            .collect::<Vec<_>>(),
        [newer_id.as_str(), older_id.as_str(),]
    );
}
