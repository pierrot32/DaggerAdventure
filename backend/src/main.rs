use axum::{routing::get, Router};
use std::net::SocketAddr;

#[tokio::main]
async fn main() {
    // 1. Define a minimal enterprise health check route
    let app = Router::new()
        .route("/healthz", get(|| async { "OK" }))
        .route("/api/hello", get(|| async { r#"{"message": "Hello from Enterprise Rust!"}"# }));

    // 2. Bind to all interfaces inside the Docker container
    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("Server running on http://{}", addr);
    
    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}