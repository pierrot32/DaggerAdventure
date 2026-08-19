use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{SoundBoard, SoundBoardDetail, SoundLabel, SoundRecord, User},
};

pub async fn list_boards(pool: &PgPool, user: &User) -> Result<Vec<SoundBoard>, sqlx::Error> {
    sqlx::query_as::<_, SoundBoard>(
        "SELECT b.id, b.owner_id, u.name AS owner_name, b.name, b.description, b.shared,
                (COUNT(s.id) + (SELECT COUNT(*) FROM sound_board_library_tracks bl WHERE bl.board_id = b.id))::BIGINT AS sound_count, b.created_at, b.updated_at
         FROM sound_boards b
         JOIN users u ON u.id = b.owner_id
         LEFT JOIN sounds s ON s.board_id = b.id
         WHERE b.shared = TRUE OR b.owner_id = $1
         GROUP BY b.id, u.name
         ORDER BY b.shared DESC, b.updated_at DESC, b.id",
    )
    .bind(user.id)
    .fetch_all(pool)
    .await
}

pub async fn create_board(
    pool: &PgPool,
    owner_id: Uuid,
    name: &str,
    description: &str,
    shared: bool,
) -> Result<SoundBoard, sqlx::Error> {
    sqlx::query_as::<_, SoundBoard>(
        "WITH inserted AS (
             INSERT INTO sound_boards (id, owner_id, name, description, shared)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING id, owner_id, name, description, shared, created_at, updated_at
         )
         SELECT i.id, i.owner_id, u.name AS owner_name, i.name, i.description, i.shared,
                0::BIGINT AS sound_count, i.created_at, i.updated_at
         FROM inserted i JOIN users u ON u.id = i.owner_id",
    )
    .bind(Uuid::new_v4())
    .bind(owner_id)
    .bind(name)
    .bind(description)
    .bind(shared)
    .fetch_one(pool)
    .await
}

pub async fn find_board(
    pool: &PgPool,
    user: &User,
    board_id: Uuid,
) -> Result<Option<SoundBoardDetail>, AppError> {
    let board = sqlx::query_as::<_, SoundBoard>(
        "SELECT b.id, b.owner_id, u.name AS owner_name, b.name, b.description, b.shared,
                (COUNT(s.id) + (SELECT COUNT(*) FROM sound_board_library_tracks bl WHERE bl.board_id = b.id))::BIGINT AS sound_count, b.created_at, b.updated_at
         FROM sound_boards b
         JOIN users u ON u.id = b.owner_id
         LEFT JOIN sounds s ON s.board_id = b.id
         WHERE b.id = $1 AND (b.shared = TRUE OR b.owner_id = $2)
         GROUP BY b.id, u.name",
    )
    .bind(board_id)
    .bind(user.id)
    .fetch_optional(pool)
    .await?;

    let Some(board) = board else {
        return Ok(None);
    };
    let sounds = list_sounds(pool, board_id).await?;
    Ok(Some(SoundBoardDetail { board, sounds }))
}

pub async fn update_board(
    pool: &PgPool,
    owner_id: Uuid,
    board_id: Uuid,
    name: &str,
    description: &str,
) -> Result<Option<SoundBoard>, sqlx::Error> {
    sqlx::query_as::<_, SoundBoard>(
        "UPDATE sound_boards b
         SET name = $1, description = $2, updated_at = now()
         FROM users u
         WHERE b.id = $3 AND b.owner_id = $4
         RETURNING b.id, b.owner_id, u.name AS owner_name, b.name, b.description, b.shared,
                   ((SELECT COUNT(*)::BIGINT FROM sounds WHERE board_id = b.id) +
                    (SELECT COUNT(*)::BIGINT FROM sound_board_library_tracks WHERE board_id = b.id)) AS sound_count,
                   b.created_at, b.updated_at",
    )
    .bind(name)
    .bind(description)
    .bind(board_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
}

pub async fn delete_board(
    pool: &PgPool,
    owner_id: Uuid,
    board_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(
        sqlx::query("DELETE FROM sound_boards WHERE id = $1 AND owner_id = $2")
            .bind(board_id)
            .bind(owner_id)
            .execute(pool)
            .await?
            .rows_affected()
            > 0,
    )
}

struct SoundRow {
    id: Uuid,
    board_id: Uuid,
    name: String,
    audio_url: Option<String>,
    audio_mime_type: Option<String>,
    image_url: Option<String>,
    creator_name: Option<String>,
    source_name: Option<String>,
    source_url: Option<String>,
    source_credit: Option<String>,
    has_audio_upload: bool,
    has_image_upload: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

impl sqlx::FromRow<'_, sqlx::postgres::PgRow> for SoundRow {
    fn from_row(row: &sqlx::postgres::PgRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            id: row.try_get("id")?,
            board_id: row.try_get("board_id")?,
            name: row.try_get("name")?,
            audio_url: row.try_get("audio_url")?,
            audio_mime_type: row.try_get("audio_mime_type")?,
            image_url: row.try_get("image_url")?,
            creator_name: row.try_get("creator_name")?,
            source_name: row.try_get("source_name")?,
            source_url: row.try_get("source_url")?,
            source_credit: row.try_get("source_credit")?,
            has_audio_upload: row.try_get("has_audio_upload")?,
            has_image_upload: row.try_get("has_image_upload")?,
            created_at: row.try_get("created_at")?,
        })
    }
}

async fn list_sounds(pool: &PgPool, board_id: Uuid) -> Result<Vec<SoundRecord>, AppError> {
    let rows = sqlx::query_as::<_, SoundRow>(
        "SELECT id, board_id, name, audio_url, audio_mime_type, image_url,
            creator_name, source_name, source_url, NULL::TEXT AS source_credit,
            NULL::UUID AS library_track_id,
                (audio_data IS NOT NULL) AS has_audio_upload,
                (image_data IS NOT NULL) AS has_image_upload, created_at
         FROM sounds WHERE board_id = $1 ORDER BY created_at, id",
    )
    .bind(board_id)
    .fetch_all(pool)
    .await?;

    let mut sounds = Vec::with_capacity(rows.len());
    for row in rows {
        let labels = sqlx::query_as::<_, SoundLabel>(
            "SELECT l.id, l.name
             FROM sound_labels l
             JOIN sound_label_links link ON link.label_id = l.id
             WHERE link.sound_id = $1 ORDER BY l.name, l.id",
        )
        .bind(row.id)
        .fetch_all(pool)
        .await?;
        sounds.push(SoundRecord {
            id: row.id,
            board_id: row.board_id,
            library_track_id: None,
            name: row.name,
            audio_url: row.audio_url,
            audio_mime_type: row.audio_mime_type,
            image_url: row.image_url,
            creator_name: row.creator_name,
            source_name: row.source_name,
            source_url: row.source_url,
            source_credit: row.source_credit,
            has_audio_upload: row.has_audio_upload,
            has_image_upload: row.has_image_upload,
            labels,
            created_at: row.created_at,
        });
    }
    let tracks = sqlx::query_as::<_, LibraryTrackRow>(
        "SELECT t.id, t.owner_id, t.name, t.audio_url, t.audio_mime_type, t.image_url,
                t.creator_name, t.source_id, s.name AS source_name, s.website_url AS source_url,
                s.description AS source_description, t.source_credit,
                (t.audio_data IS NOT NULL) AS has_audio_upload,
                (t.image_data IS NOT NULL) AS has_image_upload, t.created_at
         FROM sound_board_library_tracks link
         JOIN sound_library_tracks t ON t.id = link.track_id
         LEFT JOIN sound_sources s ON s.id = t.source_id
         WHERE link.board_id = $1 ORDER BY link.created_at, t.id",
    )
    .bind(board_id)
    .fetch_all(pool)
    .await?;
    for row in tracks {
        let labels = library_labels(pool, row.id).await?;
        sounds.push(SoundRecord {
            id: row.id,
            board_id,
            library_track_id: Some(row.id),
            name: row.name,
            audio_url: row.audio_url,
            audio_mime_type: row.audio_mime_type,
            image_url: row.image_url,
            creator_name: row.creator_name,
            source_name: row.source_name,
            source_url: row.source_url,
            source_credit: row.source_credit,
            has_audio_upload: row.has_audio_upload,
            has_image_upload: row.has_image_upload,
            labels,
            created_at: row.created_at,
        });
    }
    Ok(sounds)
}

#[derive(Debug, sqlx::FromRow)]
struct LibraryTrackRow {
    id: Uuid,
    owner_id: Uuid,
    name: String,
    audio_url: Option<String>,
    audio_mime_type: Option<String>,
    image_url: Option<String>,
    creator_name: Option<String>,
    source_id: Option<Uuid>,
    source_name: Option<String>,
    source_url: Option<String>,
    source_description: Option<String>,
    source_credit: Option<String>,
    has_audio_upload: bool,
    has_image_upload: bool,
    created_at: chrono::DateTime<chrono::Utc>,
}

async fn library_labels(pool: &PgPool, track_id: Uuid) -> Result<Vec<SoundLabel>, AppError> {
    Ok(sqlx::query_as::<_, SoundLabel>(
        "SELECT l.id, l.name FROM sound_library_labels l
         JOIN sound_library_label_links link ON link.label_id = l.id
         WHERE link.track_id = $1 ORDER BY l.name, l.id",
    )
    .bind(track_id)
    .fetch_all(pool)
    .await?)
}

pub struct NewSound {
    pub name: String,
    pub audio_url: Option<String>,
    pub audio: Option<(Vec<u8>, String)>,
    pub image_url: Option<String>,
    pub image: Option<(Vec<u8>, String)>,
    pub creator_name: Option<String>,
    pub source_name: Option<String>,
    pub source_url: Option<String>,
    pub source_id: Option<Uuid>,
    pub source_credit: Option<String>,
    pub labels: Vec<String>,
}

pub async fn create_sound(
    pool: &PgPool,
    board_id: Uuid,
    sound: NewSound,
) -> Result<SoundRecord, AppError> {
    let mut transaction = pool.begin().await?;
    let sound_id = Uuid::new_v4();
    let (audio_data, audio_mime_type) = sound.audio.unwrap_or((Vec::new(), String::new()));
    let has_audio_upload = !audio_data.is_empty();
    let (image_data, image_mime_type) = sound.image.unwrap_or((Vec::new(), String::new()));
    let has_image_upload = !image_data.is_empty();
    sqlx::query(
        "INSERT INTO sounds
         (id, board_id, name, audio_url, audio_data, audio_mime_type, image_url,
          image_data, image_mime_type, creator_name, source_name, source_url)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''::BYTEA), NULLIF($6, ''), $7,
                 NULLIF($8, ''::BYTEA), NULLIF($9, ''), $10, $11, $12)",
    )
    .bind(sound_id)
    .bind(board_id)
    .bind(sound.name)
    .bind(sound.audio_url)
    .bind(audio_data)
    .bind(if has_audio_upload {
        Some(audio_mime_type)
    } else {
        None
    })
    .bind(sound.image_url)
    .bind(image_data)
    .bind(if has_image_upload {
        Some(image_mime_type)
    } else {
        None
    })
    .bind(sound.creator_name)
    .bind(sound.source_name)
    .bind(sound.source_url)
    .execute(&mut *transaction)
    .await?;
    link_labels(&mut transaction, board_id, sound_id, sound.labels).await?;
    transaction.commit().await?;
    get_sound(pool, board_id, sound_id)
        .await?
        .ok_or_else(|| AppError::Internal("Created sound could not be loaded".to_owned()))
}

async fn link_labels(
    transaction: &mut Transaction<'_, Postgres>,
    board_id: Uuid,
    sound_id: Uuid,
    labels: Vec<String>,
) -> Result<(), AppError> {
    for label in labels {
        let label_id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO sound_labels (id, board_id, name) VALUES ($1, $2, $3)
             ON CONFLICT (board_id, lower(name)) DO UPDATE SET name = sound_labels.name
             RETURNING id",
        )
        .bind(Uuid::new_v4())
        .bind(board_id)
        .bind(label)
        .fetch_one(&mut **transaction)
        .await?;
        sqlx::query(
            "INSERT INTO sound_label_links (sound_id, label_id) VALUES ($1, $2)
             ON CONFLICT DO NOTHING",
        )
        .bind(sound_id)
        .bind(label_id)
        .execute(&mut **transaction)
        .await?;
    }
    Ok(())
}

async fn get_sound(
    pool: &PgPool,
    board_id: Uuid,
    sound_id: Uuid,
) -> Result<Option<SoundRecord>, AppError> {
    Ok(list_sounds(pool, board_id)
        .await?
        .into_iter()
        .find(|sound| sound.id == sound_id))
}

pub async fn delete_sound(
    pool: &PgPool,
    owner_id: Uuid,
    board_id: Uuid,
    sound_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query(
        "DELETE FROM sounds s USING sound_boards b
         WHERE s.id = $1 AND s.board_id = $2 AND b.id = s.board_id AND b.owner_id = $3",
    )
    .bind(sound_id)
    .bind(board_id)
    .bind(owner_id)
    .execute(pool)
    .await?
    .rows_affected()
        > 0)
}

pub struct NewLibraryTrack {
    pub name: String,
    pub audio_url: Option<String>,
    pub audio: Option<(Vec<u8>, String)>,
    pub image_url: Option<String>,
    pub image: Option<(Vec<u8>, String)>,
    pub creator_name: Option<String>,
    pub source_id: Option<Uuid>,
    pub source_credit: Option<String>,
    pub labels: Vec<String>,
}

pub async fn list_sources(
    pool: &PgPool,
    owner_id: Uuid,
) -> Result<Vec<crate::models::SoundSource>, sqlx::Error> {
    sqlx::query_as::<_, crate::models::SoundSource>(
        "SELECT id, owner_id, name, website_url, description, created_at, updated_at
         FROM sound_sources WHERE owner_id = $1 ORDER BY lower(name), id",
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await
}

pub async fn create_source(
    pool: &PgPool,
    owner_id: Uuid,
    name: &str,
    website_url: &str,
    description: &str,
) -> Result<crate::models::SoundSource, AppError> {
    sqlx::query_as::<_, crate::models::SoundSource>(
        "INSERT INTO sound_sources (id, owner_id, name, website_url, description)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, owner_id, name, website_url, description, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(owner_id)
    .bind(name)
    .bind(website_url)
    .bind(description)
    .fetch_one(pool)
    .await
    .map_err(map_source_write_error)
}

pub async fn update_source(
    pool: &PgPool,
    owner_id: Uuid,
    source_id: Uuid,
    name: &str,
    website_url: &str,
    description: &str,
) -> Result<Option<crate::models::SoundSource>, AppError> {
    sqlx::query_as::<_, crate::models::SoundSource>(
        "UPDATE sound_sources SET name = $1, website_url = $2, description = $3, updated_at = now()
         WHERE id = $4 AND owner_id = $5
         RETURNING id, owner_id, name, website_url, description, created_at, updated_at",
    )
    .bind(name)
    .bind(website_url)
    .bind(description)
    .bind(source_id)
    .bind(owner_id)
    .fetch_optional(pool)
    .await
    .map_err(map_source_write_error)
}

fn map_source_write_error(error: sqlx::Error) -> AppError {
    if crate::repository::user_repo::is_unique_violation(&error) {
        AppError::Conflict("A sound source with that name already exists".to_owned())
    } else {
        AppError::Internal(error.to_string())
    }
}

pub async fn delete_source(
    pool: &PgPool,
    owner_id: Uuid,
    source_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(
        sqlx::query("DELETE FROM sound_sources WHERE id = $1 AND owner_id = $2")
            .bind(source_id)
            .bind(owner_id)
            .execute(pool)
            .await?
            .rows_affected()
            > 0,
    )
}

pub async fn list_library(
    pool: &PgPool,
    owner_id: Uuid,
) -> Result<Vec<crate::models::SoundLibraryTrack>, AppError> {
    let rows = sqlx::query_as::<_, LibraryTrackRow>(
        "SELECT t.id, t.owner_id, t.name, t.audio_url, t.audio_mime_type, t.image_url,
                t.creator_name, t.source_id, s.name AS source_name, s.website_url AS source_url,
                s.description AS source_description, t.source_credit,
                (t.audio_data IS NOT NULL) AS has_audio_upload,
                (t.image_data IS NOT NULL) AS has_image_upload, t.created_at
         FROM sound_library_tracks t LEFT JOIN sound_sources s ON s.id = t.source_id
         WHERE t.owner_id = $1 ORDER BY t.created_at DESC, t.id",
    )
    .bind(owner_id)
    .fetch_all(pool)
    .await?;
    let mut tracks = Vec::with_capacity(rows.len());
    for row in rows {
        tracks.push(crate::models::SoundLibraryTrack {
            id: row.id,
            owner_id: row.owner_id,
            name: row.name,
            audio_url: row.audio_url,
            audio_mime_type: row.audio_mime_type,
            image_url: row.image_url,
            creator_name: row.creator_name,
            source_id: row.source_id,
            source_name: row.source_name,
            source_url: row.source_url,
            source_description: row.source_description,
            source_credit: row.source_credit,
            has_audio_upload: row.has_audio_upload,
            has_image_upload: row.has_image_upload,
            labels: library_labels(pool, row.id).await?,
            created_at: row.created_at,
        });
    }
    Ok(tracks)
}

pub async fn create_library_track(
    pool: &PgPool,
    owner_id: Uuid,
    track: NewLibraryTrack,
) -> Result<crate::models::SoundLibraryTrack, AppError> {
    let mut transaction = pool.begin().await?;
    if let Some(source_id) = track.source_id {
        let owned = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(SELECT 1 FROM sound_sources WHERE id = $1 AND owner_id = $2)",
        )
        .bind(source_id)
        .bind(owner_id)
        .fetch_one(&mut *transaction)
        .await?;
        if !owned {
            return Err(AppError::Validation(
                "Choose one of your sound sources".to_owned(),
            ));
        }
    }
    let track_id = Uuid::new_v4();
    let (audio_data, audio_mime_type) = track.audio.unwrap_or_default();
    let (image_data, image_mime_type) = track.image.unwrap_or_default();
    sqlx::query(
        "INSERT INTO sound_library_tracks
         (id, owner_id, name, audio_url, audio_data, audio_mime_type, image_url, image_data,
          image_mime_type, creator_name, source_id, source_credit)
         VALUES ($1, $2, $3, $4, NULLIF($5, ''::BYTEA), NULLIF($6, ''), $7,
                 NULLIF($8, ''::BYTEA), NULLIF($9, ''), $10, $11, $12)",
    )
    .bind(track_id)
    .bind(owner_id)
    .bind(track.name)
    .bind(track.audio_url)
    .bind(audio_data)
    .bind(if audio_mime_type.is_empty() {
        None
    } else {
        Some(audio_mime_type)
    })
    .bind(track.image_url)
    .bind(image_data)
    .bind(if image_mime_type.is_empty() {
        None
    } else {
        Some(image_mime_type)
    })
    .bind(track.creator_name)
    .bind(track.source_id)
    .bind(track.source_credit)
    .execute(&mut *transaction)
    .await?;
    link_library_labels(&mut transaction, owner_id, track_id, track.labels).await?;
    transaction.commit().await?;
    list_library(pool, owner_id)
        .await?
        .into_iter()
        .find(|item| item.id == track_id)
        .ok_or_else(|| AppError::Internal("Created library track could not be loaded".to_owned()))
}

async fn link_library_labels(
    transaction: &mut Transaction<'_, Postgres>,
    owner_id: Uuid,
    track_id: Uuid,
    labels: Vec<String>,
) -> Result<(), AppError> {
    for label in labels {
        let label_id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO sound_library_labels (id, owner_id, name) VALUES ($1, $2, $3)
             ON CONFLICT (owner_id, lower(name)) DO UPDATE SET name = sound_library_labels.name RETURNING id",
        ).bind(Uuid::new_v4()).bind(owner_id).bind(label).fetch_one(&mut **transaction).await?;
        sqlx::query("INSERT INTO sound_library_label_links (track_id, label_id) VALUES ($1, $2) ON CONFLICT DO NOTHING")
            .bind(track_id).bind(label_id).execute(&mut **transaction).await?;
    }
    Ok(())
}

pub async fn delete_library_track(
    pool: &PgPool,
    owner_id: Uuid,
    track_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(
        sqlx::query("DELETE FROM sound_library_tracks WHERE id = $1 AND owner_id = $2")
            .bind(track_id)
            .bind(owner_id)
            .execute(pool)
            .await?
            .rows_affected()
            > 0,
    )
}

pub async fn attach_library_track(
    pool: &PgPool,
    owner_id: Uuid,
    board_id: Uuid,
    track_id: Uuid,
) -> Result<bool, AppError> {
    let result = sqlx::query(
        "INSERT INTO sound_board_library_tracks (board_id, track_id)
         SELECT $1, t.id FROM sound_library_tracks t JOIN sound_boards b ON b.id = $1
         WHERE t.id = $2 AND t.owner_id = $3 AND b.owner_id = $3
         ON CONFLICT DO NOTHING",
    )
    .bind(board_id)
    .bind(track_id)
    .bind(owner_id)
    .execute(pool)
    .await?;
    Ok(result.rows_affected() > 0)
}

pub async fn detach_library_track(
    pool: &PgPool,
    owner_id: Uuid,
    board_id: Uuid,
    track_id: Uuid,
) -> Result<bool, sqlx::Error> {
    Ok(sqlx::query("DELETE FROM sound_board_library_tracks link USING sound_boards b WHERE link.board_id = $1 AND link.track_id = $2 AND b.id = link.board_id AND b.owner_id = $3")
        .bind(board_id).bind(track_id).bind(owner_id).execute(pool).await?.rows_affected() > 0)
}

pub async fn media(
    pool: &PgPool,
    user: &User,
    board_id: Uuid,
    sound_id: Uuid,
    kind: &str,
) -> Result<Option<(Vec<u8>, String)>, AppError> {
    let column = match kind {
        "audio" => "audio_data, audio_mime_type",
        "image" => "image_data, image_mime_type",
        _ => return Ok(None),
    };
    let query = format!(
        "SELECT {column} FROM sounds s
         JOIN sound_boards b ON b.id = s.board_id
         WHERE s.id = $1 AND s.board_id = $2 AND (b.shared = TRUE OR b.owner_id = $3)"
    );
    let row = sqlx::query_as::<_, (Option<Vec<u8>>, Option<String>)>(&query)
        .bind(sound_id)
        .bind(board_id)
        .bind(user.id)
        .fetch_optional(pool)
        .await?;
    if let Some(media) = row.and_then(|(data, mime)| data.zip(mime)) {
        return Ok(Some(media));
    }
    let query = format!(
        "SELECT {column} FROM sound_library_tracks t JOIN sound_board_library_tracks link ON link.track_id = t.id
         JOIN sound_boards b ON b.id = link.board_id
         WHERE t.id = $1 AND link.board_id = $2 AND (b.shared = TRUE OR b.owner_id = $3)"
    );
    let row = sqlx::query_as::<_, (Option<Vec<u8>>, Option<String>)>(&query)
        .bind(sound_id)
        .bind(board_id)
        .bind(user.id)
        .fetch_optional(pool)
        .await?;
    Ok(row.and_then(|(data, mime)| data.zip(mime)))
}
