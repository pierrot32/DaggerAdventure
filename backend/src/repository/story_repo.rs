use sha2::{Digest, Sha256};
use sqlx::{PgConnection, PgPool};
use std::collections::HashSet;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        StoryEvent, StoryEventRequest, StoryGoal, StoryGoalRequest,
        StoryMilestone, StoryMilestoneRequest, StoryPlan, StoryProposal,
        StoryProposalItem, User, validate_apply_key,
    },
};

#[derive(Debug, sqlx::FromRow)]
struct StoryAccess {
    description: Option<String>,
    is_creator: bool,
}

#[derive(Debug, sqlx::FromRow)]
struct StoryMilestoneRow {
    id: Uuid,
    adventure_id: Uuid,
    title: String,
    description: String,
    status: String,
    position: i32,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

async fn lock_creator(
    connection: &mut PgConnection,
    adventure_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let creator_id = sqlx::query_scalar::<_, Uuid>(
        "SELECT creator_id FROM adventures WHERE id = $1 FOR UPDATE",
    )
    .bind(adventure_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;
    if creator_id != user_id {
        return Err(AppError::Forbidden(
            "Only the adventure creator can change its story plan".to_owned(),
        ));
    }
    Ok(())
}

pub async fn ensure_creator(
    pool: &PgPool,
    adventure_id: Uuid,
    user_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn get_story(
    pool: &PgPool,
    user: &User,
    adventure_id: Uuid,
) -> Result<StoryPlan, AppError> {
    let access = sqlx::query_as::<_, StoryAccess>(
        "SELECT a.description, a.creator_id = $2 AS is_creator
         FROM adventures a
         LEFT JOIN adventure_members m
           ON m.adventure_id = a.id AND m.user_id = $2 AND m.status = 'accepted'
         WHERE a.id = $1 AND (a.creator_id = $2 OR m.user_id IS NOT NULL)",
    )
    .bind(adventure_id)
    .bind(user.id)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;

    let goals = sqlx::query_as::<_, StoryGoal>(
        "SELECT g.id, g.adventure_id, g.character_id, c.name AS character_name,
                g.goal_type, g.title, g.description, g.status, g.position,
                g.created_at, g.updated_at
         FROM adventure_story_goals g
         LEFT JOIN characters c ON c.id = g.character_id AND c.adventure_id = g.adventure_id
         WHERE g.adventure_id = $1 AND ($2 OR g.goal_type = 'player')
         ORDER BY g.position, g.id",
    )
    .bind(adventure_id)
    .bind(access.is_creator)
    .fetch_all(pool)
    .await?;

    let milestone_rows = sqlx::query_as::<_, StoryMilestoneRow>(
        "SELECT id, adventure_id, title, description, status, position,
                created_at, updated_at
         FROM adventure_story_milestones
         WHERE adventure_id = $1
         ORDER BY position, id",
    )
    .bind(adventure_id)
    .fetch_all(pool)
    .await?;
    let events = sqlx::query_as::<_, StoryEvent>(
        "SELECT e.id, e.milestone_id, e.title, e.description, e.status,
                e.position, e.created_at, e.updated_at
         FROM adventure_story_events e
         JOIN adventure_story_milestones m ON m.id = e.milestone_id
         WHERE m.adventure_id = $1
         ORDER BY e.milestone_id, e.position, e.id",
    )
    .bind(adventure_id)
    .fetch_all(pool)
    .await?;
    let mut events_by_milestone = std::collections::HashMap::new();
    for event in events {
        events_by_milestone
            .entry(event.milestone_id)
            .or_insert_with(Vec::new)
            .push(event);
    }
    let milestones = milestone_rows
        .into_iter()
        .map(|row| StoryMilestone {
            id: row.id,
            adventure_id: row.adventure_id,
            title: row.title,
            description: row.description,
            status: row.status,
            position: row.position,
            events: events_by_milestone.remove(&row.id).unwrap_or_default(),
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
        .collect();

    Ok(StoryPlan {
        description: access.description,
        goals,
        milestones,
    })
}

async fn validate_character(
    connection: &mut PgConnection,
    adventure_id: Uuid,
    character_id: Option<Uuid>,
) -> Result<(), AppError> {
    if let Some(character_id) = character_id {
        let belongs = sqlx::query_scalar::<_, bool>(
            "SELECT EXISTS(
                 SELECT 1 FROM characters WHERE id = $1 AND adventure_id = $2
             )",
        )
        .bind(character_id)
        .bind(adventure_id)
        .fetch_one(&mut *connection)
        .await?;
        if !belongs {
            return Err(AppError::Validation(
                "The selected character does not belong to this adventure"
                    .to_owned(),
            ));
        }
    }
    Ok(())
}

async fn goal(
    connection: &mut PgConnection,
    goal_id: Uuid,
    adventure_id: Uuid,
) -> Result<StoryGoal, AppError> {
    sqlx::query_as::<_, StoryGoal>(
        "SELECT g.id, g.adventure_id, g.character_id, c.name AS character_name,
                g.goal_type, g.title, g.description, g.status, g.position,
                g.created_at, g.updated_at
         FROM adventure_story_goals g
         LEFT JOIN characters c ON c.id = g.character_id AND c.adventure_id = g.adventure_id
         WHERE g.id = $1 AND g.adventure_id = $2",
    )
    .bind(goal_id)
    .bind(adventure_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or_else(|| AppError::NotFound("Story goal not found".to_owned()))
}

async fn milestone(
    connection: &mut PgConnection,
    milestone_id: Uuid,
    adventure_id: Uuid,
) -> Result<StoryMilestone, AppError> {
    let row = sqlx::query_as::<_, StoryMilestoneRow>(
        "SELECT id, adventure_id, title, description, status, position,
                created_at, updated_at
         FROM adventure_story_milestones
         WHERE id = $1 AND adventure_id = $2",
    )
    .bind(milestone_id)
    .bind(adventure_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or_else(|| {
        AppError::NotFound("Story milestone not found".to_owned())
    })?;
    let events = sqlx::query_as::<_, StoryEvent>(
        "SELECT id, milestone_id, title, description, status, position,
                created_at, updated_at
         FROM adventure_story_events WHERE milestone_id = $1
         ORDER BY position, id",
    )
    .bind(milestone_id)
    .fetch_all(&mut *connection)
    .await?;
    Ok(StoryMilestone {
        id: row.id,
        adventure_id: row.adventure_id,
        title: row.title,
        description: row.description,
        status: row.status,
        position: row.position,
        events,
        created_at: row.created_at,
        updated_at: row.updated_at,
    })
}

async fn event(
    connection: &mut PgConnection,
    event_id: Uuid,
) -> Result<StoryEvent, AppError> {
    sqlx::query_as::<_, StoryEvent>(
        "SELECT id, milestone_id, title, description, status, position,
                created_at, updated_at
         FROM adventure_story_events WHERE id = $1",
    )
    .bind(event_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or_else(|| AppError::NotFound("Story event not found".to_owned()))
}

async fn item_count(
    connection: &mut PgConnection,
    table: &str,
    parent_column: &str,
    parent_id: Uuid,
) -> Result<i32, AppError> {
    let query =
        format!("SELECT COUNT(*) FROM {table} WHERE {parent_column} = $1");
    Ok(sqlx::query_scalar::<_, i64>(&query)
        .bind(parent_id)
        .fetch_one(&mut *connection)
        .await? as i32)
}

async fn shift_positions(
    connection: &mut PgConnection,
    table: &str,
    parent_column: &str,
    parent_id: Uuid,
    position: i32,
) -> Result<(), AppError> {
    let query = format!(
        "UPDATE {table} SET position = position + 1 WHERE {parent_column} = $1 AND position >= $2 AND position < 10001"
    );
    sqlx::query(&query)
        .bind(parent_id)
        .bind(position)
        .execute(&mut *connection)
        .await?;
    Ok(())
}

async fn close_positions(
    connection: &mut PgConnection,
    table: &str,
    parent_column: &str,
    parent_id: Uuid,
    position: i32,
) -> Result<(), AppError> {
    let query = format!(
        "UPDATE {table} SET position = position - 1 WHERE {parent_column} = $1 AND position > $2"
    );
    sqlx::query(&query)
        .bind(parent_id)
        .bind(position)
        .execute(&mut *connection)
        .await?;
    Ok(())
}

async fn insert_proposal_goal(
    connection: &mut PgConnection,
    adventure_id: Uuid,
    goal_type: &str,
    item: &StoryProposalItem,
    position: i32,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO adventure_story_goals
         (id, adventure_id, character_id, goal_type, title, description, status, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(Uuid::new_v4())
    .bind(adventure_id)
    .bind(item.character_id)
    .bind(goal_type)
    .bind(&item.title)
    .bind(&item.description)
    .bind(&item.status)
    .bind(position)
    .execute(&mut *connection)
    .await?;
    Ok(())
}

async fn insert_proposal_milestone(
    connection: &mut PgConnection,
    adventure_id: Uuid,
    milestone: &crate::models::StoryProposalMilestone,
    position: i32,
) -> Result<Uuid, AppError> {
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO adventure_story_milestones
         (id, adventure_id, title, description, status, position)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(adventure_id)
    .bind(&milestone.title)
    .bind(&milestone.description)
    .bind(&milestone.status)
    .bind(position)
    .execute(&mut *connection)
    .await?;
    Ok(id)
}

async fn insert_proposal_event(
    connection: &mut PgConnection,
    milestone_id: Uuid,
    event: &StoryProposalItem,
    position: i32,
) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO adventure_story_events
         (id, milestone_id, title, description, status, position)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(Uuid::new_v4())
    .bind(milestone_id)
    .bind(&event.title)
    .bind(&event.description)
    .bind(&event.status)
    .bind(position)
    .execute(&mut *connection)
    .await?;
    Ok(())
}

pub async fn apply_proposal(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    apply_key: String,
    mut proposal: StoryProposal,
) -> Result<(), AppError> {
    let apply_key =
        validate_apply_key(apply_key).map_err(AppError::Validation)?;
    proposal
        .validate_structure()
        .map_err(AppError::Validation)?;
    let proposal_hash = proposal_fingerprint(&proposal)?;
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    let existing_hash = sqlx::query_scalar::<_, String>(
        "SELECT proposal_hash FROM adventure_story_applies
         WHERE adventure_id = $1 AND apply_key = $2",
    )
    .bind(adventure_id)
    .bind(&apply_key)
    .fetch_optional(&mut *transaction)
    .await?;
    if let Some(existing_hash) = existing_hash {
        if existing_hash != proposal_hash {
            return Err(AppError::Conflict(
                "This story apply key was already used for a different proposal"
                    .to_owned(),
            ));
        }
        transaction.commit().await?;
        return Ok(());
    }

    let character_ids = sqlx::query_scalar::<_, Uuid>(
        "SELECT id FROM characters WHERE adventure_id = $1",
    )
    .bind(adventure_id)
    .fetch_all(&mut *transaction)
    .await?
    .into_iter()
    .collect::<HashSet<_>>();
    proposal
        .validate(&character_ids)
        .map_err(AppError::Validation)?;
    let inserted_hash = sqlx::query_scalar::<_, String>(
        "INSERT INTO adventure_story_applies
         (adventure_id, apply_key, proposal_hash)
         VALUES ($1, $2, $3)
         ON CONFLICT (adventure_id, apply_key) DO NOTHING
         RETURNING proposal_hash",
    )
    .bind(adventure_id)
    .bind(&apply_key)
    .bind(&proposal_hash)
    .fetch_optional(&mut *transaction)
    .await?;
    if inserted_hash.is_none() {
        let existing_hash = sqlx::query_scalar::<_, String>(
            "SELECT proposal_hash FROM adventure_story_applies
             WHERE adventure_id = $1 AND apply_key = $2",
        )
        .bind(adventure_id)
        .bind(&apply_key)
        .fetch_one(&mut *transaction)
        .await?;
        if existing_hash != proposal_hash {
            return Err(AppError::Conflict(
                "This story apply key was already used for a different proposal"
                    .to_owned(),
            ));
        }
        transaction.commit().await?;
        return Ok(());
    }

    let mut goal_position = item_count(
        &mut transaction,
        "adventure_story_goals",
        "adventure_id",
        adventure_id,
    )
    .await?;
    if let Some(goal) = proposal.goal.as_ref() {
        insert_proposal_goal(
            &mut transaction,
            adventure_id,
            "gm",
            goal,
            goal_position,
        )
        .await?;
        goal_position += 1;
    }
    for goal in &proposal.player_goals {
        insert_proposal_goal(
            &mut transaction,
            adventure_id,
            "player",
            goal,
            goal_position,
        )
        .await?;
        goal_position += 1;
    }

    let milestone_position = item_count(
        &mut transaction,
        "adventure_story_milestones",
        "adventure_id",
        adventure_id,
    )
    .await?;
    for (index, milestone) in proposal.milestones.iter().enumerate() {
        let milestone_id = insert_proposal_milestone(
            &mut transaction,
            adventure_id,
            milestone,
            milestone_position + index as i32,
        )
        .await?;
        for (event_index, event) in milestone.events.iter().enumerate() {
            insert_proposal_event(
                &mut transaction,
                milestone_id,
                event,
                event_index as i32,
            )
            .await?;
        }
    }

    transaction.commit().await?;
    Ok(())
}

fn proposal_fingerprint(proposal: &StoryProposal) -> Result<String, AppError> {
    let serialized = serde_json::to_vec(proposal)
        .map_err(|error| AppError::Internal(error.to_string()))?;
    Ok(format!("{:x}", Sha256::digest(serialized)))
}

pub async fn create_goal(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    request: StoryGoalRequest,
) -> Result<StoryGoal, AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    validate_character(&mut transaction, adventure_id, request.character_id)
        .await?;
    let position = request.position.min(
        item_count(
            &mut transaction,
            "adventure_story_goals",
            "adventure_id",
            adventure_id,
        )
        .await?,
    );
    shift_positions(
        &mut transaction,
        "adventure_story_goals",
        "adventure_id",
        adventure_id,
        position,
    )
    .await?;
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO adventure_story_goals
         (id, adventure_id, character_id, goal_type, title, description, status, position)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)",
    )
    .bind(id)
    .bind(adventure_id)
    .bind(request.character_id)
    .bind(request.goal_type)
    .bind(request.title)
    .bind(request.description)
    .bind(request.status)
    .bind(position)
    .execute(&mut *transaction)
    .await?;
    let saved = goal(&mut transaction, id, adventure_id).await?;
    transaction.commit().await?;
    Ok(saved)
}

pub async fn update_goal(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    goal_id: Uuid,
    request: StoryGoalRequest,
) -> Result<StoryGoal, AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    validate_character(&mut transaction, adventure_id, request.character_id)
        .await?;
    let old_position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM adventure_story_goals WHERE id = $1 AND adventure_id = $2 FOR UPDATE",
    )
    .bind(goal_id)
    .bind(adventure_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Story goal not found".to_owned()))?;
    let count = item_count(
        &mut transaction,
        "adventure_story_goals",
        "adventure_id",
        adventure_id,
    )
    .await?;
    let position = request.position.min(count.saturating_sub(1));
    if position != old_position {
        sqlx::query(
            "UPDATE adventure_story_goals SET position = 10001 WHERE id = $1",
        )
        .bind(goal_id)
        .execute(&mut *transaction)
        .await?;
        close_positions(
            &mut transaction,
            "adventure_story_goals",
            "adventure_id",
            adventure_id,
            old_position,
        )
        .await?;
        shift_positions(
            &mut transaction,
            "adventure_story_goals",
            "adventure_id",
            adventure_id,
            position,
        )
        .await?;
    }
    sqlx::query(
        "UPDATE adventure_story_goals
         SET character_id = $1, goal_type = $2, title = $3, description = $4,
             status = $5, position = $6, updated_at = now()
         WHERE id = $7 AND adventure_id = $8",
    )
    .bind(request.character_id)
    .bind(request.goal_type)
    .bind(request.title)
    .bind(request.description)
    .bind(request.status)
    .bind(position)
    .bind(goal_id)
    .bind(adventure_id)
    .execute(&mut *transaction)
    .await?;
    let saved = goal(&mut transaction, goal_id, adventure_id).await?;
    transaction.commit().await?;
    Ok(saved)
}

pub async fn delete_goal(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    goal_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    let position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM adventure_story_goals WHERE id = $1 AND adventure_id = $2 FOR UPDATE",
    )
    .bind(goal_id)
    .bind(adventure_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Story goal not found".to_owned()))?;
    sqlx::query(
        "DELETE FROM adventure_story_goals WHERE id = $1 AND adventure_id = $2",
    )
    .bind(goal_id)
    .bind(adventure_id)
    .execute(&mut *transaction)
    .await?;
    close_positions(
        &mut transaction,
        "adventure_story_goals",
        "adventure_id",
        adventure_id,
        position,
    )
    .await?;
    transaction.commit().await?;
    Ok(())
}

pub async fn create_milestone(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    request: StoryMilestoneRequest,
) -> Result<StoryMilestone, AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    let position = request.position.min(
        item_count(
            &mut transaction,
            "adventure_story_milestones",
            "adventure_id",
            adventure_id,
        )
        .await?,
    );
    shift_positions(
        &mut transaction,
        "adventure_story_milestones",
        "adventure_id",
        adventure_id,
        position,
    )
    .await?;
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO adventure_story_milestones
         (id, adventure_id, title, description, status, position)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(adventure_id)
    .bind(request.title)
    .bind(request.description)
    .bind(request.status)
    .bind(position)
    .execute(&mut *transaction)
    .await?;
    let saved = milestone(&mut transaction, id, adventure_id).await?;
    transaction.commit().await?;
    Ok(saved)
}

pub async fn update_milestone(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    milestone_id: Uuid,
    request: StoryMilestoneRequest,
) -> Result<StoryMilestone, AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    let old_position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM adventure_story_milestones WHERE id = $1 AND adventure_id = $2 FOR UPDATE",
    )
    .bind(milestone_id)
    .bind(adventure_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Story milestone not found".to_owned()))?;
    let count = item_count(
        &mut transaction,
        "adventure_story_milestones",
        "adventure_id",
        adventure_id,
    )
    .await?;
    let position = request.position.min(count.saturating_sub(1));
    if position != old_position {
        sqlx::query("UPDATE adventure_story_milestones SET position = 10001 WHERE id = $1")
            .bind(milestone_id)
            .execute(&mut *transaction)
            .await?;
        close_positions(
            &mut transaction,
            "adventure_story_milestones",
            "adventure_id",
            adventure_id,
            old_position,
        )
        .await?;
        shift_positions(
            &mut transaction,
            "adventure_story_milestones",
            "adventure_id",
            adventure_id,
            position,
        )
        .await?;
    }
    sqlx::query(
        "UPDATE adventure_story_milestones
         SET title = $1, description = $2, status = $3, position = $4, updated_at = now()
         WHERE id = $5 AND adventure_id = $6",
    )
    .bind(request.title)
    .bind(request.description)
    .bind(request.status)
    .bind(position)
    .bind(milestone_id)
    .bind(adventure_id)
    .execute(&mut *transaction)
    .await?;
    let saved = milestone(&mut transaction, milestone_id, adventure_id).await?;
    transaction.commit().await?;
    Ok(saved)
}

pub async fn delete_milestone(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    milestone_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    lock_creator(&mut transaction, adventure_id, user_id).await?;
    let position = sqlx::query_scalar::<_, i32>(
        "SELECT position FROM adventure_story_milestones WHERE id = $1 AND adventure_id = $2 FOR UPDATE",
    )
    .bind(milestone_id)
    .bind(adventure_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Story milestone not found".to_owned()))?;
    sqlx::query("DELETE FROM adventure_story_milestones WHERE id = $1 AND adventure_id = $2")
        .bind(milestone_id)
        .bind(adventure_id)
        .execute(&mut *transaction)
        .await?;
    close_positions(
        &mut transaction,
        "adventure_story_milestones",
        "adventure_id",
        adventure_id,
        position,
    )
    .await?;
    transaction.commit().await?;
    Ok(())
}

async fn lock_milestone(
    connection: &mut PgConnection,
    milestone_id: Uuid,
    user_id: Uuid,
) -> Result<Uuid, AppError> {
    let row = sqlx::query_as::<_, (Uuid, Uuid)>(
        "SELECT m.adventure_id, a.creator_id
         FROM adventure_story_milestones m
         JOIN adventures a ON a.id = m.adventure_id
         WHERE m.id = $1 FOR UPDATE OF a, m",
    )
    .bind(milestone_id)
    .fetch_optional(&mut *connection)
    .await?
    .ok_or_else(|| {
        AppError::NotFound("Story milestone not found".to_owned())
    })?;
    if row.1 != user_id {
        return Err(AppError::Forbidden(
            "Only the adventure creator can change its story plan".to_owned(),
        ));
    }
    Ok(row.0)
}

pub async fn create_event(
    pool: &PgPool,
    user_id: Uuid,
    expected_adventure_id: Uuid,
    milestone_id: Uuid,
    request: StoryEventRequest,
) -> Result<StoryEvent, AppError> {
    let mut transaction = pool.begin().await?;
    let adventure_id =
        lock_milestone(&mut transaction, milestone_id, user_id).await?;
    if adventure_id != expected_adventure_id {
        return Err(AppError::NotFound("Story milestone not found".to_owned()));
    }
    let position = request.position.min(
        item_count(
            &mut transaction,
            "adventure_story_events",
            "milestone_id",
            milestone_id,
        )
        .await?,
    );
    shift_positions(
        &mut transaction,
        "adventure_story_events",
        "milestone_id",
        milestone_id,
        position,
    )
    .await?;
    let id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO adventure_story_events
         (id, milestone_id, title, description, status, position)
         VALUES ($1, $2, $3, $4, $5, $6)",
    )
    .bind(id)
    .bind(milestone_id)
    .bind(request.title)
    .bind(request.description)
    .bind(request.status)
    .bind(position)
    .execute(&mut *transaction)
    .await?;
    let saved = event(&mut transaction, id).await?;
    transaction.commit().await?;
    Ok(saved)
}

pub async fn update_event(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    event_id: Uuid,
    request: StoryEventRequest,
) -> Result<StoryEvent, AppError> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query_as::<_, (Uuid, Uuid, i32)>(
        "SELECT e.milestone_id, m.adventure_id, e.position
         FROM adventure_story_events e
         JOIN adventure_story_milestones m ON m.id = e.milestone_id
         JOIN adventures a ON a.id = m.adventure_id
            WHERE e.id = $1 AND m.adventure_id = $2 AND a.creator_id = $3
         FOR UPDATE OF a, m, e",
    )
    .bind(event_id)
    .bind(adventure_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Story event not found".to_owned()))?;
    let count = item_count(
        &mut transaction,
        "adventure_story_events",
        "milestone_id",
        row.0,
    )
    .await?;
    let position = request.position.min(count.saturating_sub(1));
    if position != row.2 {
        sqlx::query(
            "UPDATE adventure_story_events SET position = 10001 WHERE id = $1",
        )
        .bind(event_id)
        .execute(&mut *transaction)
        .await?;
        close_positions(
            &mut transaction,
            "adventure_story_events",
            "milestone_id",
            row.0,
            row.2,
        )
        .await?;
        shift_positions(
            &mut transaction,
            "adventure_story_events",
            "milestone_id",
            row.0,
            position,
        )
        .await?;
    }
    sqlx::query(
        "UPDATE adventure_story_events
         SET title = $1, description = $2, status = $3, position = $4, updated_at = now()
         WHERE id = $5",
    )
    .bind(request.title)
    .bind(request.description)
    .bind(request.status)
    .bind(position)
    .bind(event_id)
    .execute(&mut *transaction)
    .await?;
    let saved = event(&mut transaction, event_id).await?;
    transaction.commit().await?;
    Ok(saved)
}

pub async fn delete_event(
    pool: &PgPool,
    user_id: Uuid,
    adventure_id: Uuid,
    event_id: Uuid,
) -> Result<(), AppError> {
    let mut transaction = pool.begin().await?;
    let row = sqlx::query_as::<_, (Uuid, Uuid, i32)>(
        "SELECT e.milestone_id, m.adventure_id, e.position
         FROM adventure_story_events e
         JOIN adventure_story_milestones m ON m.id = e.milestone_id
         JOIN adventures a ON a.id = m.adventure_id
            WHERE e.id = $1 AND m.adventure_id = $2 AND a.creator_id = $3
         FOR UPDATE OF a, m, e",
    )
    .bind(event_id)
    .bind(adventure_id)
    .bind(user_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Story event not found".to_owned()))?;
    sqlx::query("DELETE FROM adventure_story_events WHERE id = $1")
        .bind(event_id)
        .execute(&mut *transaction)
        .await?;
    close_positions(
        &mut transaction,
        "adventure_story_events",
        "milestone_id",
        row.0,
        row.2,
    )
    .await?;
    transaction.commit().await?;
    Ok(())
}
