use chrono::Utc;
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{
        AccessAuditEvent, AccessLevel, AdminUser, AiPromptTemplate, User,
        UserListQuery,
    },
    repository::ai_repo,
};

pub async fn list_users(
    pool: &PgPool,
    query: &UserListQuery,
) -> Result<(Vec<AdminUser>, i64), sqlx::Error> {
    let search = query.search.as_deref().unwrap_or("");
    let access_level = query.access_level.map(AccessLevel::as_str);
    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let offset = (page - 1) * limit;
    let pattern = format!("%{}%", search.trim().to_lowercase());

    let users = sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, name, access_level, ai_generation_enabled, email_verified_at, created_at
         FROM users
         WHERE ($1 = '' OR lower(email) LIKE $2 OR lower(name) LIKE $2)
           AND ($3::text IS NULL OR access_level = $3)
         ORDER BY created_at DESC, id
         LIMIT $4 OFFSET $5",
    )
    .bind(search.trim())
    .bind(pattern)
    .bind(access_level)
    .bind(limit)
    .bind(offset)
    .fetch_all(pool)
    .await?;

    let total = sqlx::query_scalar::<_, i64>(
        "SELECT count(*)
         FROM users
         WHERE ($1 = '' OR lower(email) LIKE $2 OR lower(name) LIKE $2)
           AND ($3::text IS NULL OR access_level = $3)",
    )
    .bind(search.trim())
    .bind(format!("%{}%", search.trim().to_lowercase()))
    .bind(access_level)
    .fetch_one(pool)
    .await?;

    Ok((users, total))
}

pub async fn update_access_level(
    pool: &PgPool,
    actor: &User,
    target_id: Uuid,
    access_level: AccessLevel,
) -> Result<AdminUser, AppError> {
    if actor.id == target_id {
        return Err(AppError::Conflict(
            "You cannot change your own access level".to_owned(),
        ));
    }

    let mut transaction = pool.begin().await?;
    let target = sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, name, access_level, ai_generation_enabled, email_verified_at, created_at
         FROM users WHERE id = $1 FOR UPDATE",
    )
    .bind(target_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_owned()))?;

    if target.access_level == AccessLevel::Admin.as_str()
        && access_level != AccessLevel::Admin
    {
        let admin_count = sqlx::query_scalar::<_, i64>(
            "SELECT count(*) FROM users WHERE access_level = 'admin'",
        )
        .fetch_one(&mut *transaction)
        .await?;
        if admin_count <= 1 {
            return Err(AppError::Conflict(
                "The last admin cannot be demoted".to_owned(),
            ));
        }
    }

    sqlx::query("UPDATE users SET access_level = $1 WHERE id = $2")
        .bind(access_level.as_str())
        .bind(target_id)
        .execute(&mut *transaction)
        .await?;

    sqlx::query(
        "INSERT INTO access_level_audit_events
         (id, actor_id, target_user_id, previous_access_level, new_access_level)
         VALUES ($1, $2, $3, $4, $5)",
    )
    .bind(Uuid::new_v4())
    .bind(actor.id)
    .bind(target_id)
    .bind(&target.access_level)
    .bind(access_level.as_str())
    .execute(&mut *transaction)
    .await?;

    let updated = sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, name, access_level, ai_generation_enabled, email_verified_at, created_at
         FROM users WHERE id = $1",
    )
    .bind(target_id)
    .fetch_one(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(updated)
}

pub async fn update_approval(
    pool: &PgPool,
    actor: &User,
    target_id: Uuid,
    approved: bool,
) -> Result<AdminUser, AppError> {
    if actor.id == target_id {
        return Err(AppError::Conflict(
            "You cannot approve your own account".to_owned(),
        ));
    }

    let mut transaction = pool.begin().await?;
    let target = sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, name, access_level, ai_generation_enabled, email_verified_at, created_at
         FROM users WHERE id = $1 FOR UPDATE",
    )
    .bind(target_id)
    .fetch_optional(&mut *transaction)
    .await?
    .ok_or_else(|| AppError::NotFound("User not found".to_owned()))?;

    if target.access_level != AccessLevel::Nothing.as_str() {
        return Err(AppError::Conflict(
            "User is no longer pending approval".to_owned(),
        ));
    }

    if approved {
        sqlx::query("UPDATE users SET access_level = $1 WHERE id = $2")
            .bind(AccessLevel::PlayerOnly.as_str())
            .bind(target_id)
            .execute(&mut *transaction)
            .await?;

        sqlx::query(
            "INSERT INTO access_level_audit_events
             (id, actor_id, target_user_id, previous_access_level, new_access_level)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(Uuid::new_v4())
        .bind(actor.id)
        .bind(target_id)
        .bind(&target.access_level)
        .bind(AccessLevel::PlayerOnly.as_str())
        .execute(&mut *transaction)
        .await?;
    }

    let updated = sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, name, access_level, ai_generation_enabled, email_verified_at, created_at
         FROM users WHERE id = $1",
    )
    .bind(target_id)
    .fetch_one(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(updated)
}

pub async fn update_ai_generation_access(
    pool: &PgPool,
    target_id: Uuid,
    enabled: bool,
) -> Result<AdminUser, AppError> {
    let result = sqlx::query(
        "UPDATE users SET ai_generation_enabled = $1 WHERE id = $2",
    )
    .bind(enabled)
    .bind(target_id)
    .execute(pool)
    .await?;

    if result.rows_affected() != 1 {
        return Err(AppError::NotFound("User not found".to_owned()));
    }

    sqlx::query_as::<_, AdminUser>(
        "SELECT id, email, name, access_level, ai_generation_enabled, email_verified_at, created_at
         FROM users WHERE id = $1",
    )
    .bind(target_id)
    .fetch_one(pool)
    .await
    .map_err(AppError::from)
}

pub async fn list_audit_events(
    pool: &PgPool,
    page: i64,
    limit: i64,
) -> Result<Vec<AccessAuditEvent>, sqlx::Error> {
    let page = page.max(1);
    let limit = limit.clamp(1, 100);
    sqlx::query_as::<_, AccessAuditEvent>(
        "SELECT id, actor_id, target_user_id, previous_access_level,
                new_access_level, created_at
         FROM access_level_audit_events
         ORDER BY created_at DESC, id
         LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind((page - 1) * limit)
    .fetch_all(pool)
    .await
}

pub async fn list_ai_prompt_templates(
    pool: &PgPool,
) -> Result<Vec<AiPromptTemplate>, AppError> {
    let mut templates = Vec::with_capacity(ai_repo::PROMPT_TEMPLATE_KEYS.len());
    for generation_type in ai_repo::PROMPT_TEMPLATE_KEYS {
        let row = sqlx::query_as::<_, AiPromptTemplate>(
            "SELECT generation_type, template, updated_at
             FROM ai_prompt_templates WHERE generation_type = $1",
        )
        .bind(*generation_type)
        .fetch_optional(pool)
        .await?;
        templates.push(row.unwrap_or_else(|| AiPromptTemplate {
            generation_type: (*generation_type).to_owned(),
            template:
                ai_repo::default_prompt_template(generation_type).to_owned(),
            updated_at: Utc::now(),
        }));
    }
    Ok(templates)
}

pub async fn update_ai_prompt_template(
    pool: &PgPool,
    generation_type: &str,
    template: &str,
) -> Result<AiPromptTemplate, AppError> {
    if !ai_repo::PROMPT_TEMPLATE_KEYS.contains(&generation_type) {
        return Err(AppError::NotFound(
            "AI prompt template not found".to_owned(),
        ));
    }
    sqlx::query_as::<_, AiPromptTemplate>(
        "INSERT INTO ai_prompt_templates (generation_type, template, updated_at)
         VALUES ($1, $2, now())
         ON CONFLICT (generation_type) DO UPDATE SET template = EXCLUDED.template, updated_at = now()
         RETURNING generation_type, template, updated_at",
    )
    .bind(generation_type)
    .bind(template)
    .fetch_one(pool)
    .await
    .map_err(AppError::from)
}

pub async fn reset_ai_prompt_template(
    pool: &PgPool,
    generation_type: &str,
) -> Result<AiPromptTemplate, AppError> {
    if !ai_repo::PROMPT_TEMPLATE_KEYS.contains(&generation_type) {
        return Err(AppError::NotFound(
            "AI prompt template not found".to_owned(),
        ));
    }
    sqlx::query("DELETE FROM ai_prompt_templates WHERE generation_type = $1")
        .bind(generation_type)
        .execute(pool)
        .await?;
    Ok(AiPromptTemplate {
        generation_type: generation_type.to_owned(),
        template: ai_repo::default_prompt_template(generation_type).to_owned(),
        updated_at: Utc::now(),
    })
}
