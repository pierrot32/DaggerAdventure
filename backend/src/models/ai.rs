use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
pub struct GenerateRequest {
    pub prompt: String,
}

#[derive(Debug, Serialize)]
pub struct GenerateResponse {
    pub content: String,
}
