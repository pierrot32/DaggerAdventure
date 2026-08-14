use axum::{
    Json,
    extract::{Path, Query, State},
};
use serde::Deserialize;
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{
        AccessLevel, UpdateAccessLevelRequest, UpdateAiGenerationRequest, UpdateApprovalRequest,
        UserListQuery, UserListResponse,
    },
    repository::{admin_repo, ai_repo},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct AuditQuery {
    pub page: Option<i64>,
    pub limit: Option<i64>,
}

pub async fn list_users(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Query(query): Query<UserListQuery>,
) -> Result<Json<UserListResponse>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    let page = query.page.unwrap_or(1).max(1);
    let limit = query.limit.unwrap_or(25).clamp(1, 100);
    let (users, total) = admin_repo::list_users(&state.db, &query).await?;
    Ok(Json(UserListResponse {
        users,
        total,
        page,
        limit,
    }))
}

pub async fn update_access_level(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(target_id): Path<Uuid>,
    Json(request): Json<UpdateAccessLevelRequest>,
) -> Result<Json<crate::models::AdminUser>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    let user =
        admin_repo::update_access_level(&state.db, &actor, target_id, request.access_level).await?;
    Ok(Json(user))
}

pub async fn update_approval(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(target_id): Path<Uuid>,
    Json(request): Json<UpdateApprovalRequest>,
) -> Result<Json<crate::models::AdminUser>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    let user = admin_repo::update_approval(&state.db, &actor, target_id, request.approved).await?;
    Ok(Json(user))
}

pub async fn update_ai_generation_access(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Path(target_id): Path<Uuid>,
    Json(request): Json<UpdateAiGenerationRequest>,
) -> Result<Json<crate::models::AdminUser>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    let user =
        admin_repo::update_ai_generation_access(&state.db, target_id, request.enabled).await?;
    Ok(Json(user))
}

pub async fn list_audit_events(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Vec<crate::models::AccessAuditEvent>>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    let events = admin_repo::list_audit_events(
        &state.db,
        query.page.unwrap_or(1),
        query.limit.unwrap_or(25),
    )
    .await?;
    Ok(Json(events))
}

pub async fn list_ai_logs(
    State(state): State<AppState>,
    AuthUser(actor): AuthUser,
    Query(query): Query<AuditQuery>,
) -> Result<Json<Vec<crate::models::AiGenerationLog>>, AppError> {
    require_at_least(&actor, AccessLevel::Admin)?;
    let logs = ai_repo::list_logs(
        &state.db,
        query.page.unwrap_or(1),
        query.limit.unwrap_or(25),
    )
    .await?;
    Ok(Json(logs))
}
