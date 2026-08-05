use sqlx::PgPool;

use crate::models::{ImportBookRequest, SourceBook};

pub async fn import_book(
    pool: &PgPool,
    request: &ImportBookRequest,
) -> Result<SourceBook, sqlx::Error> {
    sqlx::query_as::<_, SourceBook>(
        "INSERT INTO source_books (id, title, version, source_file, content)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title,
           version = EXCLUDED.version, source_file = EXCLUDED.source_file,
           content = EXCLUDED.content, imported_at = now()
         RETURNING id, title, version, source_file, content, imported_at",
    )
    .bind(&request.id)
    .bind(&request.title)
    .bind(&request.version)
    .bind(&request.source_file)
    .bind(&request.content)
    .fetch_one(pool)
    .await
}

pub async fn find_character_creation_book(
    pool: &PgPool,
) -> Result<Option<SourceBook>, sqlx::Error> {
    sqlx::query_as::<_, SourceBook>(
        "SELECT id, title, version, source_file, content, imported_at
         FROM source_books ORDER BY imported_at DESC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
}
