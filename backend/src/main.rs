use std::net::SocketAddr;

use backend::{config::Config, routes, state::AppState};
use sqlx::postgres::PgPoolOptions;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();

    let config = Config::from_env();
    let db = PgPoolOptions::new()
        .max_connections(10)
        .connect(&config.database_url)
        .await
        .expect("unable to connect to Postgres");

    backend::run_migrations(&db)
        .await
        .expect("unable to run database migrations");

    if let Some(admin_email) = &config.admin_email {
        backend::repository::user_repo::bootstrap_admin(&db, admin_email)
            .await
            .expect("unable to bootstrap admin account");
    }

    let port = config.port;
    let state = AppState { db, config };
    let app = routes::router(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    println!("Server running on http://{addr}");

    axum::Server::bind(&addr)
        .serve(app.into_make_service_with_connect_info::<SocketAddr>())
        .await
        .unwrap();
}
