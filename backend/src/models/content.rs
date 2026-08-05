use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Deserialize)]
pub struct ImportBookRequest {
    pub id: String,
    pub title: String,
    pub version: String,
    pub source_file: String,
    pub content: Value,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SourceBook {
    pub id: String,
    pub title: String,
    pub version: String,
    pub source_file: String,
    pub content: Value,
    pub imported_at: DateTime<Utc>,
}
