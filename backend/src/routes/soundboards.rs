use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderValue, Response, StatusCode, header},
    response::IntoResponse,
};
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, CreateSoundBoardRequest, UpdateSoundBoardRequest},
    repository::soundboard_repo::{self, NewSound},
    state::AppState,
};

pub const MAX_UPLOAD_BYTES: usize = 60 * 1024 * 1024;
const MAX_AUDIO_BYTES: usize = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES: usize = 5 * 1024 * 1024;

pub async fn list(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<crate::models::SoundBoard>>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    Ok(Json(soundboard_repo::list_boards(&state.db, &user).await?))
}

pub async fn create(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(request): Json<CreateSoundBoardRequest>,
) -> Result<(StatusCode, Json<crate::models::SoundBoard>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (name, description) = validate_board_metadata(&request.name, &request.description)?;
    let shared = request.shared && user.access_level == AccessLevel::Admin.as_str();
    let board =
        soundboard_repo::create_board(&state.db, user.id, &name, &description, shared).await?;
    Ok((StatusCode::CREATED, Json(board)))
}

pub async fn get(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(board_id): Path<Uuid>,
) -> Result<Json<crate::models::SoundBoardDetail>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    soundboard_repo::find_board(&state.db, &user, board_id)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Soundboard not found".to_owned()))
}

pub async fn update(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(board_id): Path<Uuid>,
    Json(request): Json<UpdateSoundBoardRequest>,
) -> Result<Json<crate::models::SoundBoard>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (name, description) = validate_board_metadata(&request.name, &request.description)?;
    soundboard_repo::update_board(&state.db, user.id, board_id, &name, &description)
        .await?
        .map(Json)
        .ok_or_else(|| AppError::NotFound("Soundboard not found or not owned by you".to_owned()))
}

pub async fn delete(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(board_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !soundboard_repo::delete_board(&state.db, user.id, board_id).await? {
        return Err(AppError::NotFound(
            "Soundboard not found or not owned by you".to_owned(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn create_sound(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(board_id): Path<Uuid>,
    multipart: Multipart,
) -> Result<(StatusCode, Json<crate::models::SoundRecord>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    ensure_board_owner(&state, &user, board_id).await?;
    let form = parse_sound_form(multipart).await?;
    let sound = soundboard_repo::create_sound(&state.db, board_id, form).await?;
    Ok((StatusCode::CREATED, Json(sound)))
}

pub async fn delete_sound(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((board_id, sound_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !soundboard_repo::delete_sound(&state.db, user.id, board_id, sound_id).await? {
        return Err(AppError::NotFound(
            "Sound not found or not owned by you".to_owned(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn media(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((board_id, sound_id, kind)): Path<(Uuid, Uuid, String)>,
) -> Result<impl IntoResponse, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let Some((data, mime)) =
        soundboard_repo::media(&state.db, &user, board_id, sound_id, &kind).await?
    else {
        return Err(AppError::NotFound("Sound media not found".to_owned()));
    };
    let mime = HeaderValue::from_str(&mime)
        .map_err(|_| AppError::Internal("Invalid stored media type".to_owned()))?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(data))
        .map_err(|_| AppError::Internal("Could not build media response".to_owned()))
}

async fn ensure_board_owner(
    state: &AppState,
    user: &crate::models::User,
    board_id: Uuid,
) -> Result<(), AppError> {
    let board = soundboard_repo::find_board(&state.db, user, board_id)
        .await?
        .ok_or_else(|| AppError::NotFound("Soundboard not found".to_owned()))?;
    if board.board.owner_id != user.id {
        return Err(AppError::Forbidden(
            "Only the soundboard owner can change its sounds".to_owned(),
        ));
    }
    Ok(())
}

fn validate_board_metadata(name: &str, description: &str) -> Result<(String, String), AppError> {
    let name = name.trim();
    let description = description.trim();
    if name.is_empty() || name.len() > 120 {
        return Err(AppError::Validation(
            "Soundboard names must be 1 to 120 characters".to_owned(),
        ));
    }
    if description.len() > 800 {
        return Err(AppError::Validation(
            "Soundboard descriptions cannot exceed 800 characters".to_owned(),
        ));
    }
    Ok((name.to_owned(), description.to_owned()))
}

async fn parse_sound_form(mut multipart: Multipart) -> Result<NewSound, AppError> {
    let mut name = None;
    let mut audio_url = None;
    let mut audio = None;
    let mut image_url = None;
    let mut image = None;
    let mut creator_name = None;
    let mut source_name = None;
    let mut source_url = None;
    let mut labels = Vec::new();
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| AppError::Validation("Could not read the sound upload".to_owned()))?
    {
        let Some(field_name) = field.name().map(str::to_owned) else {
            continue;
        };
        match field_name.as_str() {
            "audio" | "image" => {
                let content_type = field
                    .content_type()
                    .unwrap_or("application/octet-stream")
                    .to_owned();
                let bytes = field
                    .bytes()
                    .await
                    .map_err(|_| {
                        AppError::Validation("Could not read the uploaded file".to_owned())
                    })?
                    .to_vec();
                if field_name == "audio" {
                    if bytes.is_empty()
                        || bytes.len() > MAX_AUDIO_BYTES
                        || (!content_type.starts_with("audio/")
                            && content_type != "application/ogg")
                    {
                        return Err(AppError::Validation(
                            "Audio uploads must be non-empty audio files under 50 MB".to_owned(),
                        ));
                    }
                    audio = Some((bytes, content_type));
                } else {
                    if bytes.is_empty()
                        || bytes.len() > MAX_IMAGE_BYTES
                        || !content_type.starts_with("image/")
                    {
                        return Err(AppError::Validation(
                            "Artwork uploads must be non-empty images under 5 MB".to_owned(),
                        ));
                    }
                    image = Some((bytes, content_type));
                }
            }
            "labels" => {
                labels.extend(parse_labels(&field.text().await.map_err(|_| {
                    AppError::Validation("Could not read labels".to_owned())
                })?))
            }
            "name" => {
                name = Some(field.text().await.map_err(|_| {
                    AppError::Validation("Could not read the sound name".to_owned())
                })?)
            }
            "audio_url" => {
                audio_url = clean_optional_url(
                    field.text().await.map_err(|_| {
                        AppError::Validation("Could not read the audio URL".to_owned())
                    })?,
                    "audio URL",
                )?
            }
            "image_url" => {
                image_url = clean_optional_url(
                    field.text().await.map_err(|_| {
                        AppError::Validation("Could not read the artwork URL".to_owned())
                    })?,
                    "artwork URL",
                )?
            }
            "creator_name" => {
                creator_name = clean_optional_text(
                    field.text().await.map_err(|_| {
                        AppError::Validation("Could not read the creator name".to_owned())
                    })?,
                    160,
                )
            }
            "source_name" => {
                source_name = clean_optional_text(
                    field.text().await.map_err(|_| {
                        AppError::Validation("Could not read the source name".to_owned())
                    })?,
                    160,
                )
            }
            "source_url" => {
                source_url = clean_optional_url(
                    field.text().await.map_err(|_| {
                        AppError::Validation("Could not read the source URL".to_owned())
                    })?,
                    "source URL",
                )?
            }
            _ => {}
        }
    }
    let name = name
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::Validation("Every sound needs a name".to_owned()))?;
    if name.len() > 160 {
        return Err(AppError::Validation(
            "Sound names cannot exceed 160 characters".to_owned(),
        ));
    }
    if audio.is_some() && audio_url.is_some() {
        return Err(AppError::Validation(
            "Choose an uploaded audio file or an audio URL, not both".to_owned(),
        ));
    }
    if audio.is_none() && audio_url.is_none() {
        return Err(AppError::Validation(
            "Add an audio file or an audio URL".to_owned(),
        ));
    }
    labels.sort();
    labels.dedup();
    if labels.len() > 12 {
        return Err(AppError::Validation(
            "A sound can have at most 12 labels".to_owned(),
        ));
    }
    Ok(NewSound {
        name,
        audio_url,
        audio,
        image_url,
        image,
        creator_name,
        source_name,
        source_url,
        labels,
    })
}

fn parse_labels(value: &str) -> Vec<String> {
    value
        .split([',', '\n'])
        .map(str::trim)
        .filter(|label| !label.is_empty() && label.len() <= 40)
        .map(str::to_lowercase)
        .collect()
}

fn clean_optional_text(value: String, max_length: usize) -> Option<String> {
    let value = value.trim();
    (!value.is_empty() && value.len() <= max_length).then(|| value.to_owned())
}

fn clean_optional_url(value: String, label: &str) -> Result<Option<String>, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if !value.starts_with("https://") && !value.starts_with("http://") {
        return Err(AppError::Validation(format!(
            "{label} must start with http:// or https://"
        )));
    }
    if value.len() > 2_000 {
        return Err(AppError::Validation(format!("{label} is too long")));
    }
    Ok(Some(value.to_owned()))
}
