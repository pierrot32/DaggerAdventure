pub mod admin;
pub mod adventures;
pub mod ai;
pub mod auth;
pub mod characters;
pub mod content;
pub mod notifications;
pub mod users;

use axum::{
    Router, middleware,
    routing::{get, post},
};

use crate::middleware::auth_guard::require_auth;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    let protected = Router::new()
        .route("/api/hello", get(users::hello))
        .route("/api/auth/me", get(users::me))
        .route(
            "/api/content/character-creation",
            get(content::get_character_creation_book),
        )
        .route("/api/content/books/import", post(content::import_book))
        .route("/api/admin/content/books", get(content::list_books))
        .route(
            "/api/admin/content/books/export",
            get(content::export_books),
        )
        .route(
            "/api/admin/content/books/:book_id",
            axum::routing::put(content::update_book_content),
        )
        .route(
            "/api/characters",
            get(characters::list).post(characters::create),
        )
        .route(
            "/api/characters/:character_id",
            get(characters::get)
                .put(characters::update)
                .delete(characters::delete),
        )
        .route(
            "/api/characters/:character_id/stats",
            axum::routing::patch(characters::update_stats),
        )
        .route(
            "/api/characters/:character_id/advancement",
            axum::routing::patch(characters::advance),
        )
        .route(
            "/api/characters/:character_id/adventure",
            axum::routing::patch(characters::link_adventure),
        )
        .route("/api/admin/users", get(admin::list_users))
        .route(
            "/api/admin/users/:target_id/access-level",
            axum::routing::patch(admin::update_access_level),
        )
        .route("/api/admin/access-audit", get(admin::list_audit_events))
        .route("/api/admin/ai-logs", get(admin::list_ai_logs))
        .route(
            "/api/admin/users/:target_id/ai-generation",
            axum::routing::patch(admin::update_ai_generation_access),
        )
        .route("/api/ai/generate", post(ai::generate))
        .route("/api/ai/character", post(ai::generate_character))
        .route(
            "/api/ai/character-image",
            post(ai::generate_character_image),
        )
        .route(
            "/api/adventures",
            get(adventures::list).post(adventures::create),
        )
        .route("/api/adventures/:adventure_id", get(adventures::get))
        .route(
            "/api/adventures/:adventure_id/characters",
            get(adventures::characters),
        )
        .route(
            "/api/adventures/:adventure_id/invites",
            get(adventures::list_invites).post(adventures::create_invite),
        )
        .route(
            "/api/adventures/:adventure_id/fear",
            axum::routing::patch(adventures::update_fear),
        )
        .route("/api/invites", get(adventures::my_invites))
        .route(
            "/api/invites/:invite_id/accept",
            post(adventures::accept_invite),
        )
        .route(
            "/api/invites/:invite_id/decline",
            post(adventures::decline_invite),
        )
        .route("/api/notifications", get(notifications::list))
        .route(
            "/api/notifications/:notification_id/read",
            post(notifications::mark_read),
        )
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        .route("/healthz", get(|| async { "OK" }))
        .route("/api/auth/register", post(auth::register))
        .route("/api/auth/login", post(auth::login))
        .route("/api/auth/logout", post(auth::logout))
        .merge(protected)
        .with_state(state)
}
