use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{Adventure, AdventureInvite, PendingInviteView, User},
};

pub async fn create(
    pool: &PgPool,
    creator_id: Uuid,
    name: &str,
    description: Option<&str>,
) -> Result<Adventure, sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let adventure = sqlx::query_as::<_, Adventure>(
        "INSERT INTO adventures (id, creator_id, name, description)
         VALUES ($1, $2, $3, $4)
         RETURNING id, creator_id, name, description, fear, created_at, updated_at",
    )
    .bind(Uuid::new_v4())
    .bind(creator_id)
    .bind(name)
    .bind(description)
    .fetch_one(&mut *transaction)
    .await?;

    sqlx::query(
        "INSERT INTO adventure_members (adventure_id, user_id, status)
         VALUES ($1, $2, 'accepted')",
    )
    .bind(adventure.id)
    .bind(creator_id)
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(adventure)
}

pub async fn list_visible(pool: &PgPool, user: &User) -> Result<Vec<Adventure>, sqlx::Error> {
    let is_admin = user.access_level == "admin";
    sqlx::query_as::<_, Adventure>(
        "SELECT DISTINCT a.id, a.creator_id, a.name, a.description, a.fear, a.created_at, a.updated_at
         FROM adventures a
         LEFT JOIN adventure_members m ON m.adventure_id = a.id
         LEFT JOIN adventure_invites i ON i.adventure_id = a.id
         WHERE $1
            OR a.creator_id = $2
            OR (m.user_id = $2 AND m.status = 'accepted')
            OR (i.recipient_user_id = $2 AND i.status = 'pending')
         ORDER BY a.updated_at DESC, a.id",
    )
    .bind(is_admin)
    .bind(user.id)
    .fetch_all(pool)
    .await
}

pub async fn find_visible(
    pool: &PgPool,
    user: &User,
    adventure_id: Uuid,
) -> Result<Option<Adventure>, sqlx::Error> {
    let is_admin = user.access_level == "admin";
    sqlx::query_as::<_, Adventure>(
        "SELECT DISTINCT a.id, a.creator_id, a.name, a.description, a.fear, a.created_at, a.updated_at
         FROM adventures a
         LEFT JOIN adventure_members m ON m.adventure_id = a.id
         LEFT JOIN adventure_invites i ON i.adventure_id = a.id
         WHERE a.id = $1
           AND ($2 OR a.creator_id = $3
                OR (m.user_id = $3 AND m.status = 'accepted')
                OR (i.recipient_user_id = $3 AND i.status = 'pending'))",
    )
    .bind(adventure_id)
    .bind(is_admin)
    .bind(user.id)
    .fetch_optional(pool)
    .await
}

pub async fn is_creator(
    pool: &PgPool,
    adventure_id: Uuid,
    user_id: Uuid,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS(
             SELECT 1 FROM adventures WHERE id = $1 AND creator_id = $2
         )",
    )
    .bind(adventure_id)
    .bind(user_id)
    .fetch_one(pool)
    .await
}

pub async fn create_invite(
    pool: &PgPool,
    inviter: &User,
    adventure_id: Uuid,
    email: &str,
) -> Result<AdventureInvite, AppError> {
    let mut transaction = pool.begin().await?;
    let adventure =
        sqlx::query_scalar::<_, Uuid>("SELECT creator_id FROM adventures WHERE id = $1 FOR UPDATE")
            .bind(adventure_id)
            .fetch_optional(&mut *transaction)
            .await?
            .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;

    if adventure != inviter.id {
        return Err(AppError::Forbidden(
            "Only the adventure creator can invite users".to_owned(),
        ));
    }

    let recipient_user_id =
        sqlx::query_scalar::<_, Uuid>("SELECT id FROM users WHERE lower(email) = lower($1)")
            .bind(email)
            .fetch_optional(&mut *transaction)
            .await?;

    let invite = sqlx::query_as::<_, AdventureInvite>(
        "INSERT INTO adventure_invites
         (id, adventure_id, inviter_id, recipient_email, recipient_user_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, adventure_id, inviter_id, recipient_email,
                   recipient_user_id, status, created_at, accepted_at",
    )
    .bind(Uuid::new_v4())
    .bind(adventure_id)
    .bind(inviter.id)
    .bind(email)
    .bind(recipient_user_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|error| {
        if crate::repository::user_repo::is_unique_violation(&error) {
            AppError::Conflict("A pending invitation already exists for this email".to_owned())
        } else {
            AppError::Internal(error.to_string())
        }
    })?;

    if let Some(recipient_user_id) = recipient_user_id {
        sqlx::query(
            "INSERT INTO notifications
             (id, recipient_user_id, actor_user_id, adventure_id, invite_id,
              notification_type, title, body)
             VALUES ($1, $2, $3, $4, $5, 'adventure_invite', $6, $7)",
        )
        .bind(Uuid::new_v4())
        .bind(recipient_user_id)
        .bind(inviter.id)
        .bind(adventure_id)
        .bind(invite.id)
        .bind("New adventure invitation")
        .bind(format!("{} invited you to join an adventure", inviter.name))
        .execute(&mut *transaction)
        .await?;
    }

    transaction.commit().await?;
    Ok(invite)
}

pub async fn list_invites(
    pool: &PgPool,
    creator_id: Uuid,
    adventure_id: Uuid,
) -> Result<Vec<AdventureInvite>, AppError> {
    let owner = sqlx::query_scalar::<_, Uuid>("SELECT creator_id FROM adventures WHERE id = $1")
        .bind(adventure_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;
    if owner != creator_id {
        return Err(AppError::Forbidden(
            "Only the adventure creator can view invites".to_owned(),
        ));
    }
    sqlx::query_as::<_, AdventureInvite>(
        "SELECT id, adventure_id, inviter_id, recipient_email, recipient_user_id,
                status, created_at, accepted_at
         FROM adventure_invites WHERE adventure_id = $1 ORDER BY created_at DESC",
    )
    .bind(adventure_id)
    .fetch_all(pool)
    .await
    .map_err(AppError::from)
}

pub async fn list_pending_for_user(
    pool: &PgPool,
    user: &User,
) -> Result<Vec<PendingInviteView>, sqlx::Error> {
    // Match on email as well as recipient_user_id: invites sent before the account
    // existed are only linked at registration time.
    sqlx::query_as::<_, PendingInviteView>(
        "SELECT i.id, i.adventure_id, a.name AS adventure_name, u.name AS inviter_name,
                i.recipient_email, i.status, i.created_at
         FROM adventure_invites i
         JOIN adventures a ON a.id = i.adventure_id
         JOIN users u ON u.id = i.inviter_id
         WHERE i.status = 'pending'
           AND (i.recipient_user_id = $1 OR lower(i.recipient_email) = lower($2))
         ORDER BY i.created_at DESC",
    )
    .bind(user.id)
    .bind(&user.email)
    .fetch_all(pool)
    .await
}

pub async fn update_fear(
    pool: &PgPool,
    user: &User,
    adventure_id: Uuid,
    fear: i32,
) -> Result<Adventure, AppError> {
    let fear = fear.clamp(0, 12);
    let owner = sqlx::query_scalar::<_, Uuid>("SELECT creator_id FROM adventures WHERE id = $1")
        .bind(adventure_id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| AppError::NotFound("Adventure not found".to_owned()))?;
    if owner != user.id {
        return Err(AppError::Forbidden(
            "Only the GM can change the Fear pool".to_owned(),
        ));
    }
    sqlx::query_as::<_, Adventure>(
        "UPDATE adventures SET fear = $1, updated_at = now()
         WHERE id = $2
         RETURNING id, creator_id, name, description, fear, created_at, updated_at",
    )
    .bind(fear)
    .bind(adventure_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::from)
}

pub async fn accept_invite(
    pool: &PgPool,
    user: &User,
    invite_id: Uuid,
) -> Result<AdventureInvite, AppError> {
    let mut transaction = pool.begin().await?;
    let invite = sqlx::query_as::<_, AdventureInvite>(
        "SELECT id, adventure_id, inviter_id, recipient_email, recipient_user_id,
                status, created_at, accepted_at
         FROM adventure_invites WHERE id = $1 FOR UPDATE",
    )
    .bind(invite_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("Invitation not found".to_owned()))?;

    if invite.status != "pending" || !invite.recipient_email.eq_ignore_ascii_case(&user.email) {
        return Err(AppError::Forbidden(
            "This invitation is not available to you".to_owned(),
        ));
    }

    sqlx::query(
        "INSERT INTO adventure_members (adventure_id, user_id, status)
         VALUES ($1, $2, 'accepted')
         ON CONFLICT (adventure_id, user_id)
         DO UPDATE SET status = 'accepted', joined_at = now()",
    )
    .bind(invite.adventure_id)
    .bind(user.id)
    .execute(&mut *transaction)
    .await?;

    let accepted = sqlx::query_as::<_, AdventureInvite>(
        "UPDATE adventure_invites
         SET status = 'accepted', recipient_user_id = $1, accepted_at = now()
         WHERE id = $2
         RETURNING id, adventure_id, inviter_id, recipient_email,
                   recipient_user_id, status, created_at, accepted_at",
    )
    .bind(user.id)
    .bind(invite_id)
    .fetch_one(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(accepted)
}

pub async fn decline_invite(
    pool: &PgPool,
    user: &User,
    invite_id: Uuid,
) -> Result<AdventureInvite, AppError> {
    let invite = sqlx::query_as::<_, AdventureInvite>(
        "UPDATE adventure_invites
         SET status = 'declined'
         WHERE id = $1 AND status = 'pending'
           AND lower(recipient_email) = lower($2)
         RETURNING id, adventure_id, inviter_id, recipient_email,
                   recipient_user_id, status, created_at, accepted_at",
    )
    .bind(invite_id)
    .bind(&user.email)
    .fetch_optional(pool)
    .await?
    .ok_or_else(|| AppError::NotFound("Invitation not found".to_owned()))?;
    Ok(invite)
}

pub async fn link_pending_invites(pool: &PgPool, user: &User) -> Result<(), sqlx::Error> {
    #[derive(sqlx::FromRow)]
    struct PendingInvite {
        id: Uuid,
        adventure_id: Uuid,
        inviter_id: Uuid,
        adventure_name: String,
        inviter_name: String,
    }

    let mut transaction = pool.begin().await?;
    let invites = sqlx::query_as::<_, PendingInvite>(
        "UPDATE adventure_invites AS i
         SET recipient_user_id = $1
                 FROM adventures a, users u
         WHERE i.recipient_user_id IS NULL
           AND lower(i.recipient_email) = lower($2)
           AND i.status = 'pending'
           AND a.id = i.adventure_id
                     AND u.id = i.inviter_id
         RETURNING i.id, i.adventure_id, i.inviter_id, a.name AS adventure_name,
                   u.name AS inviter_name",
    )
    .bind(user.id)
    .bind(&user.email)
    .fetch_all(&mut *transaction)
    .await?;

    for invite in invites {
        sqlx::query(
            "INSERT INTO notifications
             (id, recipient_user_id, actor_user_id, adventure_id, invite_id,
              notification_type, title, body)
             VALUES ($1, $2, $3, $4, $5, 'adventure_invite', $6, $7)",
        )
        .bind(Uuid::new_v4())
        .bind(user.id)
        .bind(invite.inviter_id)
        .bind(invite.adventure_id)
        .bind(invite.id)
        .bind("New adventure invitation")
        .bind(format!(
            "{} invited you to join {}",
            invite.inviter_name, invite.adventure_name
        ))
        .execute(&mut *transaction)
        .await?;
    }

    transaction.commit().await?;
    Ok(())
}
