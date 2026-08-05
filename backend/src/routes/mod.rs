pub mod admin;
pub mod adventures;
pub mod auth;
pub mod notifications;
pub mod users;

use axum::{
    Router,
    routing::{get, post},
};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/healthz", get(|| async { "OK" }))
        .route("/api/hello", get(users::hello))
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .route("/api/auth/me", get(users::me))
        .route("/api/admin/users", get(admin::list_users))
        .route(
            "/api/admin/users/{target_id}/access-level",
            axum::routing::patch(admin::update_access_level),
        )
        .route("/api/admin/access-audit", get(admin::list_audit_events))
        .route(
            "/api/adventures",
            get(adventures::list).post(adventures::create),
        )
        .route("/api/adventures/{adventure_id}", get(adventures::get))
        .route(
            "/api/adventures/{adventure_id}/invites",
            get(adventures::list_invites).post(adventures::create_invite),
        )
        .route(
            "/api/invites/{invite_id}/accept",
            post(adventures::accept_invite),
        )
        .route(
            "/api/invites/{invite_id}/decline",
            post(adventures::decline_invite),
        )
        .route("/api/notifications", get(notifications::list))
        .route(
            "/api/notifications/{notification_id}/read",
            post(notifications::mark_read),
        )
}
