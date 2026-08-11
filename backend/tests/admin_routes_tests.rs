mod common;

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use backend::{config::Config, repository::content_repo, routes, state::AppState};
use common::fixtures::{admin_user, player_user, sample_book, sample_content};
use hyper::body::to_bytes;
use serde_json::json;
use sqlx::PgPool;
use tower::ServiceExt;

fn app(pool: PgPool, jwt_secret: &str) -> Router {
    routes::router().with_state(AppState {
        db: pool,
        config: Config {
            database_url: "postgres://test".to_owned(),
            jwt_secret: jwt_secret.to_owned(),
            cookie_secure: false,
            port: 0,
            admin_email: None,
            openai_api_key: None,
            openai_model: "test-model".to_owned(),
            openai_image_model: "test-image-model".to_owned(),
        },
    })
}

fn request_with_cookie(uri: &str, method: axum::http::Method, token: &str) -> Request<Body> {
    Request::builder()
        .method(method)
        .uri(uri)
        .header(header::COOKIE, format!("auth_token={token}"))
        .body(Body::empty())
        .expect("request should build")
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn admin_content_routes_enforce_access_and_persist_updates(pool: PgPool) {
    let jwt_secret = "test-secret";
    let player = player_user(&pool, jwt_secret).await;
    let admin = admin_user(&pool, jwt_secret).await;
    let book_id = format!("route-book-{}", uuid::Uuid::new_v4());
    content_repo::import_book(&pool, &sample_book(&book_id))
        .await
        .expect("fixture book import should succeed");
    let application = app(pool, jwt_secret);

    let response = application
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/admin/content/books")
                .body(Body::empty())
                .expect("request should build"),
        )
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::UNAUTHORIZED);

    let response = application
        .clone()
        .oneshot(request_with_cookie(
            "/api/admin/content/books",
            axum::http::Method::GET,
            &player.token,
        ))
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::FORBIDDEN);

    let updated_content = sample_content("guardian", "warden");
    let update_body = serde_json::to_vec(&json!({"content": updated_content}))
        .expect("request body should serialize");
    let response = application
        .clone()
        .oneshot(
            Request::builder()
                .method(axum::http::Method::PUT)
                .uri(format!("/api/admin/content/books/{book_id}"))
                .header(header::COOKIE, format!("auth_token={}", admin.token))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(update_body))
                .expect("request should build"),
        )
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::OK);

    let response = application
        .clone()
        .oneshot(request_with_cookie(
            "/api/admin/content/books/export",
            axum::http::Method::GET,
            &admin.token,
        ))
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::OK);
    let exported: serde_json::Value = serde_json::from_slice(
        &to_bytes(response.into_body())
            .await
            .expect("body should read"),
    )
    .expect("export should return JSON");
    assert_eq!(
        exported
            .as_array()
            .expect("export should be an array")
            .len(),
        1
    );
    assert_eq!(exported[0]["content"]["classes"][0]["id"], "guardian");
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn admin_content_routes_return_validation_and_not_found_errors(pool: PgPool) {
    let jwt_secret = "test-secret";
    let admin = admin_user(&pool, jwt_secret).await;
    let application = app(pool, jwt_secret);

    let response = application
        .clone()
        .oneshot(
            Request::builder()
                .method(axum::http::Method::PUT)
                .uri("/api/admin/content/books/missing-book")
                .header(header::COOKIE, format!("auth_token={}", admin.token))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(r#"{"content":null}"#))
                .expect("request should build"),
        )
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);

    let response = application
        .oneshot(
            Request::builder()
                .method(axum::http::Method::PUT)
                .uri("/api/admin/content/books/missing-book")
                .header(header::COOKIE, format!("auth_token={}", admin.token))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(
                    serde_json::to_vec(&json!({
                        "content": sample_content("guardian", "warden")
                    }))
                    .expect("request body should serialize"),
                ))
                .expect("request should build"),
        )
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::NOT_FOUND);
}

#[sqlx::test]
#[ignore = "requires DATABASE_URL and disposable Postgres test databases"]
async fn example_book_fixture_still_passes_import_validation(pool: PgPool) {
    let jwt_secret = "test-secret";
    let admin = admin_user(&pool, jwt_secret).await;
    let application = app(pool, jwt_secret);
    let book: serde_json::Value =
        serde_json::from_str(include_str!("../../examples/example-book.json"))
            .expect("example book fixture should be valid JSON");
    let request_body = serde_json::to_vec(&json!({
        "id": book["id"],
        "title": book["title"],
        "version": book["version"],
        "source_file": book["source_file"],
        "content": book["content"]
    }))
    .expect("import body should serialize");

    let response = application
        .oneshot(
            Request::builder()
                .method(axum::http::Method::POST)
                .uri("/api/content/books/import")
                .header(header::COOKIE, format!("auth_token={}", admin.token))
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(request_body))
                .expect("request should build"),
        )
        .await
        .expect("request should complete");
    assert_eq!(response.status(), StatusCode::OK);
}
