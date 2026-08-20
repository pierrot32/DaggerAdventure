use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{AdventureFrame, CampaignFrame, User},
};

pub async fn list_library(
    pool: &PgPool,
    owner_id: Uuid,
) -> Result<Vec<CampaignFrame>, sqlx::Error> {
    sqlx::query_as::<_, CampaignFrame>(
        "SELECT id, owner_id, name, description, complexity_rating, content,
                created_at, updated_at
         FROM campaign_frames
         WHERE owner_id = $1
         ORDER BY updated_at DESC, id",
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await
}

pub async fn create_library(
    pool: &PgPool,
    owner_id: Uuid,
    name: &str,
    description: &str,
    complexity_rating: i32,
    content: &serde_json::Value,
) -> Result<CampaignFrame, sqlx::Error> {
    sqlx::query_as::<_, CampaignFrame>(
        "INSERT INTO campaign_frames
         (id, owner_id, name, description, complexity_rating, content)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, owner_id, name, description, complexity_rating, content,
                   created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(owner_id)
    .bind(name)
    .bind(description)
    .bind(complexity_rating)
    .bind(content)
    .fetch_one(pool)
    .await
}

pub async fn update_library(
    pool: &PgPool,
    owner_id: Uuid,
    frame_id: Uuid,
    name: &str,
    description: &str,
    complexity_rating: i32,
    content: &serde_json::Value,
) -> Result<Option<CampaignFrame>, sqlx::Error> {
    sqlx::query_as::<_, CampaignFrame>(
        "UPDATE campaign_frames
         SET name = $1, description = $2, complexity_rating = $3,
             content = $4, updated_at = now()
         WHERE id = $5 AND owner_id = $6
         RETURNING id, owner_id, name, description, complexity_rating, content,
                   created_at, updated_at",
    )
    .bind(name)
    .bind(description)
    .bind(complexity_rating)
    .bind(content)
    .bind(frame_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
}

pub async fn delete_library(
    pool: &PgPool,
    owner_id: Uuid,
    frame_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query(
        "DELETE FROM campaign_frames WHERE id = $1 AND owner_id = $2",
    )
    .bind(frame_id)
    .bind(owner_id)
    .execute(pool)
    .await?
    .rows_affected()
        > 0)
}

pub async fn find_library(
    pool: &PgPool,
    owner_id: Uuid,
    frame_id: Uuid,
) -> Result<Option<CampaignFrame>, sqlx::Error> {
    sqlx::query_as::<_, CampaignFrame>(
        "SELECT id, owner_id, name, description, complexity_rating, content,
                created_at, updated_at
         FROM campaign_frames WHERE id = $1 AND owner_id = $2",
    )
    .bind(frame_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
}

pub async fn list_builtins(
    pool: &PgPool,
) -> Result<Vec<serde_json::Value>, sqlx::Error> {
    let books = sqlx::query_scalar::<_, serde_json::Value>(
        "SELECT content->'frames'
         FROM source_books
         WHERE content ? 'frames' AND jsonb_typeof(content->'frames') = 'array'
         ORDER BY imported_at DESC
         LIMIT 1",
    )
    .fetch_optional(pool)
    .await?;
    Ok(books
        .and_then(|frames| frames.as_array().cloned())
        .unwrap_or_default())
}

pub async fn find_builtin(
    pool: &PgPool,
    frame_id: &str,
) -> Result<Option<serde_json::Value>, sqlx::Error> {
    let frames = list_builtins(pool).await?;
    Ok(frames.into_iter().find(|frame| {
        frame.get("id").and_then(serde_json::Value::as_str) == Some(frame_id)
    }))
}

pub async fn attach(
    pool: &PgPool,
    user: &User,
    adventure_id: Uuid,
    source_type: &str,
    source_id: Option<&str>,
    content: &serde_json::Value,
) -> Result<AdventureFrame, AppError> {
    ensure_owner(pool, user.id, adventure_id).await?;
    sqlx::query_as::<_, AdventureFrame>(
        "INSERT INTO adventure_frames
         (adventure_id, source_type, source_id, content, selections)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (adventure_id) DO UPDATE SET
           source_type = EXCLUDED.source_type,
           source_id = EXCLUDED.source_id,
           content = EXCLUDED.content,
           selections = EXCLUDED.selections,
           updated_at = now()
         RETURNING adventure_id, source_type, source_id, content, selections,
                   created_at, updated_at",
    )
    .bind(adventure_id)
    .bind(source_type)
    .bind(source_id)
    .bind(content)
    .bind(default_selections(content))
    .fetch_one(pool)
    .await
    .map_err(AppError::from)
}

pub async fn attach_in_transaction(
    connection: &mut sqlx::PgConnection,
    adventure_id: Uuid,
    source_type: &str,
    source_id: Option<&str>,
    content: &serde_json::Value,
) -> Result<AdventureFrame, AppError> {
    sqlx::query_as::<_, AdventureFrame>(
        "INSERT INTO adventure_frames
         (adventure_id, source_type, source_id, content, selections)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING adventure_id, source_type, source_id, content, selections,
                   created_at, updated_at",
    )
    .bind(adventure_id)
    .bind(source_type)
    .bind(source_id)
    .bind(content)
    .bind(default_selections(content))
    .fetch_one(connection)
    .await
    .map_err(AppError::from)
}

pub async fn find_for_user(
    pool: &PgPool,
    user: &User,
    adventure_id: Uuid,
) -> Result<Option<AdventureFrame>, sqlx::Error> {
    let is_admin = user.access_level == "admin";
    sqlx::query_as::<_, AdventureFrame>(
        "SELECT af.adventure_id, af.source_type, af.source_id, af.content,
                af.selections, af.created_at, af.updated_at
         FROM adventure_frames af
         JOIN adventures a ON a.id = af.adventure_id
         LEFT JOIN adventure_members m ON m.adventure_id = a.id
         LEFT JOIN adventure_invites i ON i.adventure_id = a.id
         WHERE af.adventure_id = $1
         AND ($2 OR a.creator_id = $3
             OR (m.user_id = $3 AND m.status = 'accepted'))",
    )
    .bind(adventure_id)
    .bind(is_admin)
    .bind(user.id)
    .fetch_optional(pool)
    .await
}

pub async fn update_for_owner(
    pool: &PgPool,
    user: &User,
    adventure_id: Uuid,
    content: &serde_json::Value,
    selections: &serde_json::Value,
) -> Result<Option<AdventureFrame>, AppError> {
    ensure_owner(pool, user.id, adventure_id).await?;
    sqlx::query_as::<_, AdventureFrame>(
        "UPDATE adventure_frames
         SET content = $1, selections = $2, updated_at = now()
         WHERE adventure_id = $3
         RETURNING adventure_id, source_type, source_id, content, selections,
                   created_at, updated_at",
    )
    .bind(content)
    .bind(selections)
    .bind(adventure_id)
    .fetch_optional(pool)
    .await
    .map_err(AppError::from)
}

async fn ensure_owner(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
) -> Result<(), AppError> {
    let owner = sqlx::query_scalar::<_, Uuid>(
        "SELECT creator_id FROM adventures WHERE id = $1",
    )
    .bind(adventure_id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;
    if owner != user_id {
        return Err(AppError::Forbidden(
            "Only the adventure creator can manage its frame".to_owned(),
        ));
    }
    Ok(())
}

fn default_selections(content: &serde_json::Value) -> serde_json::Value {
    let mut selections = serde_json::Map::new();
    let sections = [
        "pitch",
        "tone_and_feel",
        "themes",
        "touchstones",
        "overview",
        "modifications",
        "player_principles",
        "gm_principles",
        "distinctions",
        "inciting_incident",
        "campaign_mechanics",
        "session_zero_questions",
    ];
    for section in sections {
        if content.get(section).is_some() {
            selections.insert(section.to_owned(), serde_json::json!(true));
        }
    }
    if let Some(modifications) = content
        .get("modifications")
        .and_then(|value| value.as_object())
    {
        for kind in ["communities", "ancestries", "classes"] {
            if let Some(entries) = modifications.get(kind) {
                let ids = entries
                    .as_object()
                    .map(|values| values.keys().cloned().collect::<Vec<_>>())
                    .or_else(|| {
                        entries.as_array().map(|values| {
                            values
                                .iter()
                                .filter_map(|value| {
                                    value
                                        .get("id")
                                        .and_then(serde_json::Value::as_str)
                                })
                                .map(str::to_owned)
                                .collect::<Vec<_>>()
                        })
                    })
                    .unwrap_or_default();
                let values = ids
                    .into_iter()
                    .map(|id| (id, serde_json::json!(true)))
                    .collect::<serde_json::Map<_, _>>();
                selections
                    .insert(kind.to_owned(), serde_json::Value::Object(values));
            }
        }
    }
    serde_json::Value::Object(selections)
}
