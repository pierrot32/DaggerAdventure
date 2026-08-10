use axum::{Json, extract::State};

use crate::{
    error::AppError,
    middleware::{access_guard::require_ai_generation, auth_guard::AuthUser},
    models::{GenerateRequest, GenerateResponse},
    services::openai_service,
    state::AppState,
};

pub async fn generate(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(request): Json<GenerateRequest>,
) -> Result<Json<GenerateResponse>, AppError> {
    require_ai_generation(&user)?;

    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err(AppError::Validation("Prompt cannot be empty".to_owned()));
    }
    if prompt.chars().count() > 4000 {
        return Err(AppError::Validation(
            "Prompt must be 4000 characters or fewer".to_owned(),
        ));
    }

    let content = openai_service::generate(&state.config, prompt).await?;
    Ok(Json(GenerateResponse { content }))
}
