use sqlx::{PgPool, Postgres, Transaction};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{SoundBoard, SoundBoardDetail, SoundLabel, SoundRecord, User},
};

pub async fn list_boards(pool: &PgPool, user: &User) -> Result<Vec<SoundBoard>, sqlx::Error> {
    sqlx::query_as::<_, SoundBoard>(
        "SELECT b.id, b.owner_id, u.name AS owner_name, b.name, b.description, b.shared,
                COUNT(s.id)::BIGINT AS sound_count, b.created_at, b.updated_at
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
                COUNT(s.id)::BIGINT AS sound_count, b.created_at, b.updated_at
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
                   (SELECT COUNT(*)::BIGINT FROM sounds WHERE board_id = b.id) AS sound_count,
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
            has_audio_upload: row.try_get("has_audio_upload")?,
            has_image_upload: row.try_get("has_image_upload")?,
            created_at: row.try_get("created_at")?,
        })
    }
}

async fn list_sounds(pool: &PgPool, board_id: Uuid) -> Result<Vec<SoundRecord>, AppError> {
    let rows = sqlx::query_as::<_, SoundRow>(
        "SELECT id, board_id, name, audio_url, audio_mime_type, image_url,
                creator_name, source_name, source_url,
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
            name: row.name,
            audio_url: row.audio_url,
            audio_mime_type: row.audio_mime_type,
            image_url: row.image_url,
            creator_name: row.creator_name,
            source_name: row.source_name,
            source_url: row.source_url,
            has_audio_upload: row.has_audio_upload,
            has_image_upload: row.has_image_upload,
            labels,
            created_at: row.created_at,
        });
    }
    Ok(sounds)
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
    Ok(row.and_then(|(data, mime)| data.zip(mime)))
}
