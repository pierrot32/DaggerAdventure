use sqlx::PgPool;
use uuid::Uuid;

use crate::{error::AppError, models::AdventureNote};

const ADVENTURE_NOTE_RESOURCE: &str = "adventure-notes";
const CHARACTER_NOTE_RESOURCE: &str = "character-notes";

async fn lock_note_resource(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    resource_type: &str,
    resource_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query("SELECT pg_advisory_xact_lock(hashtextextended($1, 0))")
        .bind(format!("{resource_type}:{resource_id}"))
        .execute(&mut **transaction)
        .await?;
    Ok(())
}

pub async fn list(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
) -> Result<Vec<AdventureNote>, AppError> {
    sqlx::query_as::<_, AdventureNote>(
        "SELECT n.id, n.adventure_id, n.creator_id, n.section_id, n.title, n.body, n.position, n.created_at, n.updated_at
         FROM adventure_notes n
         JOIN adventure_note_sections s ON s.id = n.section_id
         WHERE n.adventure_id = $1 AND n.creator_id = $2
         ORDER BY s.position, s.id, n.position, n.id",
    )
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::from)
}

pub async fn create(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
    title: &str,
    body: &str,
) -> Result<AdventureNote, AppError> {
    create_adventure_note(
        pool,
        adventure_id,
        creator_id,
        title,
        body,
        None,
        None,
    )
    .await
}

pub async fn update(
    pool: &PgPool,
    adventure_id: Uuid,
    note_id: Uuid,
    creator_id: Uuid,
    title: &str,
    body: &str,
) -> Result<Option<AdventureNote>, AppError> {
    update_adventure_note(
        pool,
        adventure_id,
        note_id,
        creator_id,
        title,
        body,
        None,
        None,
    )
    .await
}

pub async fn delete(
    pool: &PgPool,
    adventure_id: Uuid,
    note_id: Uuid,
    creator_id: Uuid,
) -> Result<bool, AppError> {
    delete_adventure_note(pool, adventure_id, note_id, creator_id).await
}

use sqlx::{Postgres, Transaction};

pub async fn ensure_adventure_default_section(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    ensure_adventure_default_section_in_transaction(
        &mut transaction,
        adventure_id,
        creator_id,
    )
    .await?;
    transaction.commit().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::validate_position;

    #[test]
    fn position_must_fit_the_sequence() {
        assert!(validate_position(0, 0).is_ok());
        assert!(validate_position(3, 3).is_ok());
        assert!(validate_position(-1, 3).is_err());
        assert!(validate_position(4, 3).is_err());
        assert!(validate_position(10_001, 10_001).is_err());
    }
}

pub async fn list_adventure_sections(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
) -> Result<Vec<crate::models::AdventureNoteSection>, AppError> {
    sqlx::query_as::<_, crate::models::AdventureNoteSection>(
        "SELECT id, adventure_id, creator_id, name, position, created_at, updated_at
         FROM adventure_note_sections WHERE adventure_id = $1 AND creator_id = $2 ORDER BY position, id",
    )
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::from)
}

pub async fn list_adventure_notes(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
) -> Result<Vec<AdventureNote>, AppError> {
    list(pool, adventure_id, creator_id).await
}

pub async fn create_adventure_section(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
    name: &str,
    requested_position: Option<i32>,
) -> Result<crate::models::AdventureNoteSection, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    ensure_adventure_default_section_in_transaction(
        &mut transaction,
        adventure_id,
        creator_id,
    )
    .await?;
    let count = section_count(&mut transaction, adventure_id).await?;
    let position = requested_position.unwrap_or(count);
    validate_position(position, count)?;
    let section = sqlx::query_as::<_, crate::models::AdventureNoteSection>(
        "INSERT INTO adventure_note_sections (id, adventure_id, creator_id, name, position)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, adventure_id, creator_id, name, position, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(adventure_id)
    .bind(creator_id)
    .bind(name)
    .bind(count + 1)
    .fetch_one(&mut *transaction)
    .await?;
    reorder_adventure_section(
        &mut transaction,
        adventure_id,
        section.id,
        position,
    )
    .await?;
    let section = fetch_adventure_section(&mut transaction, section.id).await?;
    transaction.commit().await?;
    Ok(section)
}

pub async fn update_adventure_section(
    pool: &PgPool,
    adventure_id: Uuid,
    section_id: Uuid,
    creator_id: Uuid,
    name: &str,
    requested_position: Option<i32>,
) -> Result<Option<crate::models::AdventureNoteSection>, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    let current = sqlx::query_as::<_, crate::models::AdventureNoteSection>(
        "SELECT id, adventure_id, creator_id, name, position, created_at, updated_at
         FROM adventure_note_sections WHERE id = $1 AND adventure_id = $2 AND creator_id = $3 FOR UPDATE",
    )
    .bind(section_id)
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_optional(&mut *transaction)
    .await?;
    let Some(current) = current else {
        return Ok(None);
    };
    let count = section_count(&mut transaction, adventure_id).await?;
    let position = requested_position.unwrap_or(current.position);
    validate_position(position, count - 1)?;
    sqlx::query("UPDATE adventure_note_sections SET name = $1, updated_at = now() WHERE id = $2")
        .bind(name)
        .bind(section_id)
        .execute(&mut *transaction)
        .await?;
    reorder_adventure_section(
        &mut transaction,
        adventure_id,
        section_id,
        position,
    )
    .await?;
    let section = fetch_adventure_section(&mut transaction, section_id).await?;
    transaction.commit().await?;
    Ok(Some(section))
}

pub async fn delete_adventure_section(
    pool: &PgPool,
    adventure_id: Uuid,
    section_id: Uuid,
    creator_id: Uuid,
) -> Result<bool, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM adventure_note_sections WHERE id = $1 AND adventure_id = $2 AND creator_id = $3)",
    )
    .bind(section_id)
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_one(&mut *transaction)
    .await?;
    if !exists {
        return Ok(false);
    }
    let note_count = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM adventure_notes WHERE section_id = $1",
    )
    .bind(section_id)
    .fetch_one(&mut *transaction)
    .await?;
    if note_count > 0 {
        return Err(AppError::Conflict(
            "Move or delete the notes in this section before deleting it"
                .to_owned(),
        ));
    }
    if section_count(&mut transaction, adventure_id).await? <= 1 {
        return Err(AppError::Conflict(
            "An adventure must keep one notes section".to_owned(),
        ));
    }
    sqlx::query("DELETE FROM adventure_note_sections WHERE id = $1")
        .bind(section_id)
        .execute(&mut *transaction)
        .await?;
    normalize_adventure_sections(&mut transaction, adventure_id).await?;
    transaction.commit().await?;
    Ok(true)
}

pub async fn create_adventure_note(
    pool: &PgPool,
    adventure_id: Uuid,
    creator_id: Uuid,
    title: &str,
    body: &str,
    requested_section: Option<Uuid>,
    requested_position: Option<i32>,
) -> Result<AdventureNote, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    ensure_adventure_default_section_in_transaction(
        &mut transaction,
        adventure_id,
        creator_id,
    )
    .await?;
    let section_id = find_adventure_section(
        &mut transaction,
        adventure_id,
        creator_id,
        requested_section,
    )
    .await?;
    let count = note_count(&mut transaction, section_id).await? as i32;
    let position = requested_position.unwrap_or(count);
    validate_position(position, count)?;
    let note = sqlx::query_as::<_, AdventureNote>(
        "INSERT INTO adventure_notes (id, adventure_id, creator_id, section_id, title, body, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, adventure_id, creator_id, section_id, title, body, position, created_at, updated_at",
    )
    .bind(Uuid::new_v4()).bind(adventure_id).bind(creator_id).bind(section_id).bind(title).bind(body).bind(count + 1)
    .fetch_one(&mut *transaction)
    .await?;
    reorder_adventure_note(
        &mut transaction,
        adventure_id,
        note.id,
        section_id,
        section_id,
        position,
    )
    .await?;
    let note = fetch_adventure_note(&mut transaction, note.id).await?;
    transaction.commit().await?;
    Ok(note)
}

pub async fn update_adventure_note(
    pool: &PgPool,
    adventure_id: Uuid,
    note_id: Uuid,
    creator_id: Uuid,
    title: &str,
    body: &str,
    requested_section: Option<Uuid>,
    requested_position: Option<i32>,
) -> Result<Option<AdventureNote>, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    let current = sqlx::query_as::<_, AdventureNote>(
        "SELECT id, adventure_id, creator_id, section_id, title, body, position, created_at, updated_at
         FROM adventure_notes WHERE id = $1 AND adventure_id = $2 AND creator_id = $3 FOR UPDATE",
    )
    .bind(note_id).bind(adventure_id).bind(creator_id).fetch_optional(&mut *transaction).await?;
    let Some(current) = current else {
        return Ok(None);
    };
    let target_section = find_adventure_section(
        &mut transaction,
        adventure_id,
        creator_id,
        requested_section.or(Some(current.section_id)),
    )
    .await?;
    let target_count = note_count(&mut transaction, target_section).await?
        as i32
        - i32::from(target_section == current.section_id);
    let position =
        requested_position.unwrap_or(if target_section == current.section_id {
            current.position
        } else {
            target_count
        });
    validate_position(position, target_count)?;
    sqlx::query(
        "UPDATE adventure_notes SET title = $1, body = $2, updated_at = now() WHERE id = $3",
    )
    .bind(title)
    .bind(body)
    .bind(note_id)
    .execute(&mut *transaction)
    .await?;
    reorder_adventure_note(
        &mut transaction,
        adventure_id,
        note_id,
        current.section_id,
        target_section,
        position,
    )
    .await?;
    let note = fetch_adventure_note(&mut transaction, note_id).await?;
    transaction.commit().await?;
    Ok(Some(note))
}

pub async fn delete_adventure_note(
    pool: &PgPool,
    adventure_id: Uuid,
    note_id: Uuid,
    creator_id: Uuid,
) -> Result<bool, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, ADVENTURE_NOTE_RESOURCE, adventure_id)
        .await?;
    let section_id = sqlx::query_scalar::<_, Uuid>(
        "DELETE FROM adventure_notes WHERE id = $1 AND adventure_id = $2 AND creator_id = $3 RETURNING section_id",
    )
    .bind(note_id)
    .bind(adventure_id)
    .bind(creator_id)
    .fetch_optional(&mut *transaction)
    .await?;
    let Some(section_id) = section_id else {
        return Ok(false);
    };
    normalize_notes(&mut transaction, section_id).await?;
    transaction.commit().await?;
    Ok(true)
}

pub async fn ensure_character_default_section(
    pool: &PgPool,
    character_id: Uuid,
    owner_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    ensure_character_default_section_in_transaction(
        &mut transaction,
        character_id,
        owner_id,
    )
    .await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn list_character_sections(
    pool: &PgPool,
    character_id: Uuid,
) -> Result<Vec<crate::models::CharacterNoteSection>, AppError> {
    sqlx::query_as::<_, crate::models::CharacterNoteSection>(
        "SELECT id, character_id, owner_id, name, position, created_at, updated_at
         FROM character_note_sections WHERE character_id = $1 ORDER BY position, id",
    )
    .bind(character_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::from)
}

pub async fn list_character_notes(
    pool: &PgPool,
    character_id: Uuid,
) -> Result<Vec<crate::models::CharacterNote>, AppError> {
    sqlx::query_as::<_, crate::models::CharacterNote>(
        "SELECT n.id, n.character_id, n.owner_id, n.section_id, n.title, n.body, n.position, n.created_at, n.updated_at
         FROM character_notes n
         JOIN character_note_sections s ON s.id = n.section_id
         WHERE n.character_id = $1
         ORDER BY s.position, s.id, n.position, n.id",
    ).bind(character_id).fetch_all(pool).await.map_err(AppError::from)
}

pub async fn create_character_section(
    pool: &PgPool,
    character_id: Uuid,
    owner_id: Uuid,
    name: &str,
    requested_position: Option<i32>,
) -> Result<crate::models::CharacterNoteSection, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    ensure_character_default_section_in_transaction(
        &mut transaction,
        character_id,
        owner_id,
    )
    .await?;
    let count = character_section_count(&mut transaction, character_id).await?;
    let position = requested_position.unwrap_or(count);
    validate_position(position, count)?;
    let section = sqlx::query_as::<_, crate::models::CharacterNoteSection>(
        "INSERT INTO character_note_sections (id, character_id, owner_id, name, position)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, character_id, owner_id, name, position, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(character_id)
    .bind(owner_id)
    .bind(name)
    .bind(count + 1)
    .fetch_one(&mut *transaction)
    .await?;
    reorder_character_section(
        &mut transaction,
        character_id,
        section.id,
        position,
    )
    .await?;
    let section = fetch_character_section(&mut transaction, section.id).await?;
    transaction.commit().await?;
    Ok(section)
}

pub async fn update_character_section(
    pool: &PgPool,
    character_id: Uuid,
    section_id: Uuid,
    owner_id: Uuid,
    name: &str,
    requested_position: Option<i32>,
) -> Result<Option<crate::models::CharacterNoteSection>, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    let current = sqlx::query_as::<_, crate::models::CharacterNoteSection>(
        "SELECT id, character_id, owner_id, name, position, created_at, updated_at
         FROM character_note_sections WHERE id = $1 AND character_id = $2 AND owner_id = $3 FOR UPDATE",
    ).bind(section_id).bind(character_id).bind(owner_id).fetch_optional(&mut *transaction).await?;
    let Some(current) = current else {
        return Ok(None);
    };
    let count = character_section_count(&mut transaction, character_id).await?;
    let position = requested_position.unwrap_or(current.position);
    validate_position(position, count - 1)?;
    sqlx::query("UPDATE character_note_sections SET name = $1, updated_at = now() WHERE id = $2")
        .bind(name)
        .bind(section_id)
        .execute(&mut *transaction)
        .await?;
    reorder_character_section(
        &mut transaction,
        character_id,
        section_id,
        position,
    )
    .await?;
    let section = fetch_character_section(&mut transaction, section_id).await?;
    transaction.commit().await?;
    Ok(Some(section))
}

pub async fn delete_character_section(
    pool: &PgPool,
    character_id: Uuid,
    section_id: Uuid,
    owner_id: Uuid,
) -> Result<bool, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    let exists = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(SELECT 1 FROM character_note_sections WHERE id = $1 AND character_id = $2 AND owner_id = $3)",
    ).bind(section_id).bind(character_id).bind(owner_id).fetch_one(&mut *transaction).await?;
    if !exists {
        return Ok(false);
    }
    let note_count = sqlx::query_scalar::<_, i64>(
        "SELECT count(*) FROM character_notes WHERE section_id = $1",
    )
    .bind(section_id)
    .fetch_one(&mut *transaction)
    .await?;
    if note_count > 0 {
        return Err(AppError::Conflict(
            "Move or delete the notes in this section before deleting it"
                .to_owned(),
        ));
    }
    if character_section_count(&mut transaction, character_id).await? <= 1 {
        return Err(AppError::Conflict(
            "A character must keep one notes section".to_owned(),
        ));
    }
    sqlx::query("DELETE FROM character_note_sections WHERE id = $1")
        .bind(section_id)
        .execute(&mut *transaction)
        .await?;
    normalize_character_sections(&mut transaction, character_id).await?;
    transaction.commit().await?;
    Ok(true)
}

pub async fn create_character_note(
    pool: &PgPool,
    character_id: Uuid,
    owner_id: Uuid,
    title: &str,
    body: &str,
    requested_section: Option<Uuid>,
    requested_position: Option<i32>,
) -> Result<crate::models::CharacterNote, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    ensure_character_default_section_in_transaction(
        &mut transaction,
        character_id,
        owner_id,
    )
    .await?;
    let section_id = find_character_section(
        &mut transaction,
        character_id,
        owner_id,
        requested_section,
    )
    .await?;
    let count =
        character_note_count(&mut transaction, section_id).await? as i32;
    let position = requested_position.unwrap_or(count);
    validate_position(position, count)?;
    let note = sqlx::query_as::<_, crate::models::CharacterNote>(
        "INSERT INTO character_notes (id, character_id, owner_id, section_id, title, body, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, character_id, owner_id, section_id, title, body, position, created_at, updated_at",
    ).bind(Uuid::new_v4()).bind(character_id).bind(owner_id).bind(section_id).bind(title).bind(body).bind(count + 1).fetch_one(&mut *transaction).await?;
    reorder_character_note(
        &mut transaction,
        character_id,
        note.id,
        section_id,
        section_id,
        position,
    )
    .await?;
    let note = fetch_character_note(&mut transaction, note.id).await?;
    transaction.commit().await?;
    Ok(note)
}

pub async fn update_character_note(
    pool: &PgPool,
    character_id: Uuid,
    note_id: Uuid,
    owner_id: Uuid,
    title: &str,
    body: &str,
    requested_section: Option<Uuid>,
    requested_position: Option<i32>,
) -> Result<Option<crate::models::CharacterNote>, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    let current = sqlx::query_as::<_, crate::models::CharacterNote>(
        "SELECT id, character_id, owner_id, section_id, title, body, position, created_at, updated_at
         FROM character_notes WHERE id = $1 AND character_id = $2 AND owner_id = $3 FOR UPDATE",
    ).bind(note_id).bind(character_id).bind(owner_id).fetch_optional(&mut *transaction).await?;
    let Some(current) = current else {
        return Ok(None);
    };
    let target_section = find_character_section(
        &mut transaction,
        character_id,
        owner_id,
        requested_section.or(Some(current.section_id)),
    )
    .await?;
    let target_count = character_note_count(&mut transaction, target_section)
        .await? as i32
        - i32::from(target_section == current.section_id);
    let position =
        requested_position.unwrap_or(if target_section == current.section_id {
            current.position
        } else {
            target_count
        });
    validate_position(position, target_count)?;
    sqlx::query(
        "UPDATE character_notes SET title = $1, body = $2, updated_at = now() WHERE id = $3",
    )
    .bind(title)
    .bind(body)
    .bind(note_id)
    .execute(&mut *transaction)
    .await?;
    reorder_character_note(
        &mut transaction,
        character_id,
        note_id,
        current.section_id,
        target_section,
        position,
    )
    .await?;
    let note = fetch_character_note(&mut transaction, note_id).await?;
    transaction.commit().await?;
    Ok(Some(note))
}

pub async fn delete_character_note(
    pool: &PgPool,
    character_id: Uuid,
    note_id: Uuid,
    owner_id: Uuid,
) -> Result<bool, AppError> {
    let mut transaction = pool.begin().await?;
    lock_note_resource(&mut transaction, CHARACTER_NOTE_RESOURCE, character_id)
        .await?;
    let section_id = sqlx::query_scalar::<_, Uuid>(
        "DELETE FROM character_notes WHERE id = $1 AND character_id = $2 AND owner_id = $3 RETURNING section_id",
    ).bind(note_id).bind(character_id).bind(owner_id).fetch_optional(&mut *transaction).await?;
    let Some(section_id) = section_id else {
        return Ok(false);
    };
    normalize_character_notes(&mut transaction, section_id).await?;
    transaction.commit().await?;
    Ok(true)
}

fn validate_position(position: i32, count: i32) -> Result<(), AppError> {
    if position < 0 || position > 10_000 || position > count {
        return Err(AppError::Validation(
            "Note position is outside the available ordering range".to_owned(),
        ));
    }
    Ok(())
}

async fn fetch_adventure_section(
    transaction: &mut Transaction<'_, Postgres>,
    section_id: Uuid,
) -> Result<crate::models::AdventureNoteSection, sqlx::Error> {
    sqlx::query_as::<_, crate::models::AdventureNoteSection>(
        "SELECT id, adventure_id, creator_id, name, position, created_at, updated_at
         FROM adventure_note_sections WHERE id = $1",
    )
    .bind(section_id)
    .fetch_one(&mut **transaction)
    .await
}

async fn fetch_adventure_note(
    transaction: &mut Transaction<'_, Postgres>,
    note_id: Uuid,
) -> Result<AdventureNote, sqlx::Error> {
    sqlx::query_as::<_, AdventureNote>(
        "SELECT id, adventure_id, creator_id, section_id, title, body, position, created_at, updated_at
         FROM adventure_notes WHERE id = $1",
    )
    .bind(note_id)
    .fetch_one(&mut **transaction)
    .await
}

async fn reorder_adventure_section(
    transaction: &mut Transaction<'_, Postgres>,
    adventure_id: Uuid,
    section_id: Uuid,
    target_position: i32,
) -> Result<(), AppError> {
    let current_position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM adventure_note_sections WHERE id = $1 AND adventure_id = $2 FOR UPDATE",
    )
    .bind(section_id)
    .bind(adventure_id)
    .fetch_one(&mut **transaction)
    .await?;
    let count = section_count(transaction, adventure_id).await?;
    validate_position(target_position, count - 1)?;

    sqlx::query(
        "UPDATE adventure_note_sections SET position = $1 WHERE id = $2",
    )
    .bind(count + 1)
    .bind(section_id)
    .execute(&mut **transaction)
    .await?;
    if target_position < current_position {
        sqlx::query(
            "UPDATE adventure_note_sections
             SET position = position + 1
             WHERE adventure_id = $1 AND id <> $2 AND position >= $3 AND position < $4",
        )
        .bind(adventure_id)
        .bind(section_id)
        .bind(target_position)
        .bind(current_position)
        .execute(&mut **transaction)
        .await?;
    } else if target_position > current_position {
        sqlx::query(
            "UPDATE adventure_note_sections
             SET position = position - 1
             WHERE adventure_id = $1 AND id <> $2 AND position > $3 AND position <= $4",
        )
        .bind(adventure_id)
        .bind(section_id)
        .bind(current_position)
        .bind(target_position)
        .execute(&mut **transaction)
        .await?;
    }
    sqlx::query(
        "UPDATE adventure_note_sections SET position = $1 WHERE id = $2",
    )
    .bind(target_position)
    .bind(section_id)
    .execute(&mut **transaction)
    .await?;
    normalize_adventure_sections(transaction, adventure_id).await?;
    Ok(())
}

async fn reorder_adventure_note(
    transaction: &mut Transaction<'_, Postgres>,
    adventure_id: Uuid,
    note_id: Uuid,
    source_section: Uuid,
    target_section: Uuid,
    target_position: i32,
) -> Result<(), AppError> {
    let current_position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM adventure_notes WHERE id = $1 AND adventure_id = $2 FOR UPDATE",
    )
    .bind(note_id)
    .bind(adventure_id)
    .fetch_one(&mut **transaction)
    .await?;
    let target_count = note_count(transaction, target_section).await? as i32
        - i32::from(source_section == target_section);
    validate_position(target_position, target_count)?;

    sqlx::query("UPDATE adventure_notes SET position = $1 WHERE id = $2")
        .bind(target_count + 1)
        .bind(note_id)
        .execute(&mut **transaction)
        .await?;
    if source_section == target_section {
        if target_position < current_position {
            sqlx::query(
                "UPDATE adventure_notes
                 SET position = position + 1
                 WHERE section_id = $1 AND id <> $2 AND position >= $3 AND position < $4",
            )
            .bind(source_section)
            .bind(note_id)
            .bind(target_position)
            .bind(current_position)
            .execute(&mut **transaction)
            .await?;
        } else if target_position > current_position {
            sqlx::query(
                "UPDATE adventure_notes
                 SET position = position - 1
                 WHERE section_id = $1 AND id <> $2 AND position > $3 AND position <= $4",
            )
            .bind(source_section)
            .bind(note_id)
            .bind(current_position)
            .bind(target_position)
            .execute(&mut **transaction)
            .await?;
        }
    } else {
        sqlx::query(
            "UPDATE adventure_notes SET position = position - 1
             WHERE section_id = $1 AND position > $2",
        )
        .bind(source_section)
        .bind(current_position)
        .execute(&mut **transaction)
        .await?;
        sqlx::query(
            "UPDATE adventure_notes SET position = position + 1
             WHERE section_id = $1 AND position >= $2",
        )
        .bind(target_section)
        .bind(target_position)
        .execute(&mut **transaction)
        .await?;
        sqlx::query("UPDATE adventure_notes SET section_id = $1 WHERE id = $2")
            .bind(target_section)
            .bind(note_id)
            .execute(&mut **transaction)
            .await?;
    }
    sqlx::query("UPDATE adventure_notes SET position = $1 WHERE id = $2")
        .bind(target_position)
        .bind(note_id)
        .execute(&mut **transaction)
        .await?;
    normalize_notes(transaction, source_section).await?;
    if target_section != source_section {
        normalize_notes(transaction, target_section).await?;
    }
    Ok(())
}

async fn fetch_character_section(
    transaction: &mut Transaction<'_, Postgres>,
    section_id: Uuid,
) -> Result<crate::models::CharacterNoteSection, sqlx::Error> {
    sqlx::query_as::<_, crate::models::CharacterNoteSection>(
        "SELECT id, character_id, owner_id, name, position, created_at, updated_at
         FROM character_note_sections WHERE id = $1",
    )
    .bind(section_id)
    .fetch_one(&mut **transaction)
    .await
}

async fn fetch_character_note(
    transaction: &mut Transaction<'_, Postgres>,
    note_id: Uuid,
) -> Result<crate::models::CharacterNote, sqlx::Error> {
    sqlx::query_as::<_, crate::models::CharacterNote>(
        "SELECT id, character_id, owner_id, section_id, title, body, position, created_at, updated_at
         FROM character_notes WHERE id = $1",
    )
    .bind(note_id)
    .fetch_one(&mut **transaction)
    .await
}

async fn reorder_character_section(
    transaction: &mut Transaction<'_, Postgres>,
    character_id: Uuid,
    section_id: Uuid,
    target_position: i32,
) -> Result<(), AppError> {
    let current_position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM character_note_sections WHERE id = $1 AND character_id = $2 FOR UPDATE",
    )
    .bind(section_id)
    .bind(character_id)
    .fetch_one(&mut **transaction)
    .await?;
    let count = character_section_count(transaction, character_id).await?;
    validate_position(target_position, count - 1)?;

    sqlx::query(
        "UPDATE character_note_sections SET position = $1 WHERE id = $2",
    )
    .bind(count + 1)
    .bind(section_id)
    .execute(&mut **transaction)
    .await?;
    if target_position < current_position {
        sqlx::query(
            "UPDATE character_note_sections
             SET position = position + 1
             WHERE character_id = $1 AND id <> $2 AND position >= $3 AND position < $4",
        )
        .bind(character_id)
        .bind(section_id)
        .bind(target_position)
        .bind(current_position)
        .execute(&mut **transaction)
        .await?;
    } else if target_position > current_position {
        sqlx::query(
            "UPDATE character_note_sections
             SET position = position - 1
             WHERE character_id = $1 AND id <> $2 AND position > $3 AND position <= $4",
        )
        .bind(character_id)
        .bind(section_id)
        .bind(current_position)
        .bind(target_position)
        .execute(&mut **transaction)
        .await?;
    }
    sqlx::query(
        "UPDATE character_note_sections SET position = $1 WHERE id = $2",
    )
    .bind(target_position)
    .bind(section_id)
    .execute(&mut **transaction)
    .await?;
    normalize_character_sections(transaction, character_id).await?;
    Ok(())
}

async fn reorder_character_note(
    transaction: &mut Transaction<'_, Postgres>,
    character_id: Uuid,
    note_id: Uuid,
    source_section: Uuid,
    target_section: Uuid,
    target_position: i32,
) -> Result<(), AppError> {
    let current_position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM character_notes WHERE id = $1 AND character_id = $2 FOR UPDATE",
    )
    .bind(note_id)
    .bind(character_id)
    .fetch_one(&mut **transaction)
    .await?;
    let target_count = character_note_count(transaction, target_section).await?
        as i32
        - i32::from(source_section == target_section);
    validate_position(target_position, target_count)?;

    sqlx::query("UPDATE character_notes SET position = $1 WHERE id = $2")
        .bind(target_count + 1)
        .bind(note_id)
        .execute(&mut **transaction)
        .await?;
    if source_section == target_section {
        if target_position < current_position {
            sqlx::query(
                "UPDATE character_notes
                 SET position = position + 1
                 WHERE section_id = $1 AND id <> $2 AND position >= $3 AND position < $4",
            )
            .bind(source_section)
            .bind(note_id)
            .bind(target_position)
            .bind(current_position)
            .execute(&mut **transaction)
            .await?;
        } else if target_position > current_position {
            sqlx::query(
                "UPDATE character_notes
                 SET position = position - 1
                 WHERE section_id = $1 AND id <> $2 AND position > $3 AND position <= $4",
            )
            .bind(source_section)
            .bind(note_id)
            .bind(current_position)
            .bind(target_position)
            .execute(&mut **transaction)
            .await?;
        }
    } else {
        sqlx::query(
            "UPDATE character_notes SET position = position - 1
             WHERE section_id = $1 AND position > $2",
        )
        .bind(source_section)
        .bind(current_position)
        .execute(&mut **transaction)
        .await?;
        sqlx::query(
            "UPDATE character_notes SET position = position + 1
             WHERE section_id = $1 AND position >= $2",
        )
        .bind(target_section)
        .bind(target_position)
        .execute(&mut **transaction)
        .await?;
        sqlx::query("UPDATE character_notes SET section_id = $1 WHERE id = $2")
            .bind(target_section)
            .bind(note_id)
            .execute(&mut **transaction)
            .await?;
    }
    sqlx::query("UPDATE character_notes SET position = $1 WHERE id = $2")
        .bind(target_position)
        .bind(note_id)
        .execute(&mut **transaction)
        .await?;
    normalize_character_notes(transaction, source_section).await?;
    if target_section != source_section {
        normalize_character_notes(transaction, target_section).await?;
    }
    Ok(())
}

async fn section_count(
    transaction: &mut Transaction<'_, Postgres>,
    adventure_id: Uuid,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*)::int FROM adventure_note_sections WHERE adventure_id = $1")
        .bind(adventure_id)
        .fetch_one(&mut **transaction)
        .await
}
async fn character_section_count(
    transaction: &mut Transaction<'_, Postgres>,
    character_id: Uuid,
) -> Result<i32, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*)::int FROM character_note_sections WHERE character_id = $1")
        .bind(character_id)
        .fetch_one(&mut **transaction)
        .await
}

async fn ensure_adventure_default_section_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    adventure_id: Uuid,
    creator_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO adventure_note_sections (id, adventure_id, creator_id, name, position)
         SELECT $1, $2, $3, 'General', 0
         WHERE NOT EXISTS (SELECT 1 FROM adventure_note_sections WHERE adventure_id = $2)",
    )
    .bind(Uuid::new_v4())
    .bind(adventure_id)
    .bind(creator_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn ensure_character_default_section_in_transaction(
    transaction: &mut Transaction<'_, Postgres>,
    character_id: Uuid,
    owner_id: Uuid,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO character_note_sections (id, character_id, owner_id, name, position)
         SELECT $1, $2, $3, 'General', 0
         WHERE NOT EXISTS (SELECT 1 FROM character_note_sections WHERE character_id = $2)",
    )
    .bind(Uuid::new_v4())
    .bind(character_id)
    .bind(owner_id)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

async fn note_count(
    transaction: &mut Transaction<'_, Postgres>,
    section_id: Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT count(*) FROM adventure_notes WHERE section_id = $1",
    )
    .bind(section_id)
    .fetch_one(&mut **transaction)
    .await
}
async fn character_note_count(
    transaction: &mut Transaction<'_, Postgres>,
    section_id: Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT count(*) FROM character_notes WHERE section_id = $1",
    )
    .bind(section_id)
    .fetch_one(&mut **transaction)
    .await
}
async fn find_adventure_section(
    transaction: &mut Transaction<'_, Postgres>,
    adventure_id: Uuid,
    creator_id: Uuid,
    requested: Option<Uuid>,
) -> Result<Uuid, AppError> {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM adventure_note_sections WHERE adventure_id = $1 AND creator_id = $2 AND ($3::uuid IS NULL OR id = $3) ORDER BY position, id LIMIT 1")
        .bind(adventure_id).bind(creator_id).bind(requested).fetch_optional(&mut **transaction).await?
        .ok_or_else(|| AppError::Validation("The selected notes section does not exist".to_owned()))
}
async fn find_character_section(
    transaction: &mut Transaction<'_, Postgres>,
    character_id: Uuid,
    owner_id: Uuid,
    requested: Option<Uuid>,
) -> Result<Uuid, AppError> {
    sqlx::query_scalar::<_, Uuid>("SELECT id FROM character_note_sections WHERE character_id = $1 AND owner_id = $2 AND ($3::uuid IS NULL OR id = $3) ORDER BY position, id LIMIT 1")
        .bind(character_id).bind(owner_id).bind(requested).fetch_optional(&mut **transaction).await?
        .ok_or_else(|| AppError::Validation("The selected notes section does not exist".to_owned()))
}
async fn normalize_adventure_sections(
    transaction: &mut Transaction<'_, Postgres>,
    adventure_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("WITH ranked AS (SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS next_position FROM adventure_note_sections WHERE adventure_id = $1) UPDATE adventure_note_sections s SET position = ranked.next_position, updated_at = now() FROM ranked WHERE s.id = ranked.id").bind(adventure_id).execute(&mut **transaction).await?;
    Ok(())
}
async fn normalize_notes(
    transaction: &mut Transaction<'_, Postgres>,
    section_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("WITH ranked AS (SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS next_position FROM adventure_notes WHERE section_id = $1) UPDATE adventure_notes n SET position = ranked.next_position FROM ranked WHERE n.id = ranked.id").bind(section_id).execute(&mut **transaction).await?;
    Ok(())
}
async fn normalize_character_sections(
    transaction: &mut Transaction<'_, Postgres>,
    character_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("WITH ranked AS (SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS next_position FROM character_note_sections WHERE character_id = $1) UPDATE character_note_sections s SET position = ranked.next_position, updated_at = now() FROM ranked WHERE s.id = ranked.id").bind(character_id).execute(&mut **transaction).await?;
    Ok(())
}
async fn normalize_character_notes(
    transaction: &mut Transaction<'_, Postgres>,
    section_id: Uuid,
) -> Result<(), sqlx::Error> {
    sqlx::query("WITH ranked AS (SELECT id, row_number() OVER (ORDER BY position, id) - 1 AS next_position FROM character_notes WHERE section_id = $1) UPDATE character_notes n SET position = ranked.next_position FROM ranked WHERE n.id = ranked.id").bind(section_id).execute(&mut **transaction).await?;
    Ok(())
}
