pub mod config;
pub mod error;
pub mod middleware;
pub mod models;
pub mod repository;
pub mod routes;
pub mod services;
pub mod state;
pub mod utils;

pub async fn run_migrations(pool: &sqlx::PgPool) -> Result<(), sqlx::migrate::MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}
