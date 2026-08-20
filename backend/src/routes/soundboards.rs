use axum::{
    Json,
    body::Body,
    extract::{Multipart, Path, State},
    http::{HeaderValue, Response, StatusCode, header},
    response::IntoResponse,
};
use reqwest::Url;
use uuid::Uuid;

use crate::{
    error::AppError,
    middleware::{access_guard::require_at_least, auth_guard::AuthUser},
    models::{AccessLevel, CreateSoundBoardRequest, UpdateSoundBoardRequest},
    repository::soundboard_repo::{self, NewLibraryTrack, NewSound},
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
    let (name, description) =
        validate_board_metadata(&request.name, &request.description)?;
    let shared =
        request.shared && user.access_level == AccessLevel::Admin.as_str();
    let board = soundboard_repo::create_board(
        &state.db,
        user.id,
        &name,
        &description,
        shared,
    )
    .await?;
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
    let (name, description) =
        validate_board_metadata(&request.name, &request.description)?;
    soundboard_repo::update_board(
        &state.db,
        user.id,
        board_id,
        &name,
        &description,
    )
    .await?
    .map(Json)
    .ok_or_else(|| {
        AppError::NotFound(
            "Soundboard not found or not owned by you".to_owned(),
        )
    })
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
    let sound =
        soundboard_repo::create_sound(&state.db, board_id, form).await?;
    Ok((StatusCode::CREATED, Json(sound)))
}

pub async fn sources(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<crate::models::SoundSource>>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    Ok(Json(
        soundboard_repo::list_sources(&state.db, user.id).await?,
    ))
}

pub async fn create_source(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Json(request): Json<crate::models::SoundSourceRequest>,
) -> Result<(StatusCode, Json<crate::models::SoundSource>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (name, website_url, description) = validate_source(&request)?;
    let source = soundboard_repo::create_source(
        &state.db,
        user.id,
        &name,
        &website_url,
        &description,
    )
    .await?;
    Ok((StatusCode::CREATED, Json(source)))
}

pub async fn update_source(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(source_id): Path<Uuid>,
    Json(request): Json<crate::models::SoundSourceRequest>,
) -> Result<Json<crate::models::SoundSource>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let (name, website_url, description) = validate_source(&request)?;
    soundboard_repo::update_source(
        &state.db,
        user.id,
        source_id,
        &name,
        &website_url,
        &description,
    )
    .await?
    .map(Json)
    .ok_or_else(|| {
        AppError::NotFound("Source not found or not owned by you".to_owned())
    })
}

pub async fn delete_source(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(source_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !soundboard_repo::delete_source(&state.db, user.id, source_id).await? {
        return Err(AppError::NotFound(
            "Source not found or not owned by you".to_owned(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn library(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
) -> Result<Json<Vec<crate::models::SoundLibraryTrack>>, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    Ok(Json(
        soundboard_repo::list_library(&state.db, user.id).await?,
    ))
}

pub async fn create_library_track(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    multipart: Multipart,
) -> Result<(StatusCode, Json<crate::models::SoundLibraryTrack>), AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let form = parse_sound_form(multipart).await?;
    let track = soundboard_repo::create_library_track(
        &state.db,
        user.id,
        NewLibraryTrack {
            name: form.name,
            audio_url: form.audio_url,
            audio: form.audio,
            image_url: form.image_url,
            image: form.image,
            creator_name: form.creator_name,
            source_id: form.source_id,
            source_credit: form.source_credit,
            labels: form.labels,
        },
    )
    .await?;
    Ok((StatusCode::CREATED, Json(track)))
}

pub async fn delete_library_track(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path(track_id): Path<Uuid>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !soundboard_repo::delete_library_track(&state.db, user.id, track_id)
        .await?
    {
        return Err(AppError::NotFound(
            "Library track not found or not owned by you".to_owned(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn attach_library_track(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((board_id, track_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    ensure_board_owner(&state, &user, board_id).await?;
    if !soundboard_repo::attach_library_track(
        &state.db, user.id, board_id, track_id,
    )
    .await?
    {
        return Err(AppError::NotFound(
            "Library track not found or already attached".to_owned(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn detach_library_track(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((board_id, track_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !soundboard_repo::detach_library_track(
        &state.db, user.id, board_id, track_id,
    )
    .await?
    {
        return Err(AppError::NotFound(
            "Library track is not attached to this board".to_owned(),
        ));
    }
    Ok(StatusCode::NO_CONTENT)
}

pub async fn library_media(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((track_id, kind)): Path<(Uuid, String)>,
) -> Result<impl IntoResponse, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    let column = match kind.as_str() {
        "audio" => "audio_data, audio_mime_type",
        "image" => "image_data, image_mime_type",
        _ => {
            return Err(AppError::NotFound(
                "Library media not found".to_owned(),
            ));
        }
    };
    let query = format!(
        "SELECT {column} FROM sound_library_tracks WHERE id = $1 AND owner_id = $2"
    );
    let row = sqlx::query_as::<_, (Option<Vec<u8>>, Option<String>)>(&query)
        .bind(track_id)
        .bind(user.id)
        .fetch_optional(&state.db)
        .await?;
    let Some((data, mime)) = row.and_then(|(data, mime)| data.zip(mime)) else {
        return Err(AppError::NotFound("Library media not found".to_owned()));
    };
    let mime = HeaderValue::from_str(&mime).map_err(|_| {
        AppError::Internal("Invalid stored media type".to_owned())
    })?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(data))
        .map_err(|_| {
            AppError::Internal("Could not build media response".to_owned())
        })
}

pub async fn delete_sound(
    State(state): State<AppState>,
    AuthUser(user): AuthUser,
    Path((board_id, sound_id)): Path<(Uuid, Uuid)>,
) -> Result<StatusCode, AppError> {
    require_at_least(&user, AccessLevel::AdventureMaker)?;
    if !soundboard_repo::delete_sound(&state.db, user.id, board_id, sound_id)
        .await?
    {
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
        soundboard_repo::media(&state.db, &user, board_id, sound_id, &kind)
            .await?
    else {
        return Err(AppError::NotFound("Sound media not found".to_owned()));
    };
    let mime = HeaderValue::from_str(&mime).map_err(|_| {
        AppError::Internal("Invalid stored media type".to_owned())
    })?;
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime)
        .header(header::CACHE_CONTROL, "private, max-age=3600")
        .body(Body::from(data))
        .map_err(|_| {
            AppError::Internal("Could not build media response".to_owned())
        })
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

fn validate_board_metadata(
    name: &str,
    description: &str,
) -> Result<(String, String), AppError> {
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

fn validate_source(
    request: &crate::models::SoundSourceRequest,
) -> Result<(String, String, String), AppError> {
    let name = request.name.trim();
    let description = request.description.trim();
    let website_url =
        clean_optional_url(request.website_url.clone(), "Website URL")?
            .ok_or_else(|| {
                AppError::Validation(
                    "A source website URL is required".to_owned(),
                )
            })?;
    if name.is_empty() || name.len() > 160 {
        return Err(AppError::Validation(
            "Source names must be 1 to 160 characters".to_owned(),
        ));
    }
    if description.len() > 800 {
        return Err(AppError::Validation(
            "Source descriptions cannot exceed 800 characters".to_owned(),
        ));
    }
    Ok((name.to_owned(), website_url, description.to_owned()))
}

async fn parse_sound_form(
    mut multipart: Multipart,
) -> Result<NewSound, AppError> {
    let mut name = None;
    let mut audio_url = None;
    let mut audio = None;
    let mut image_url = None;
    let mut image = None;
    let mut creator_name = None;
    let mut source_name = None;
    let mut source_url = None;
    let mut source_id = None;
    let mut source_credit = None;
    let mut labels = Vec::new();
    while let Some(field) = multipart.next_field().await.map_err(|_| {
        AppError::Validation("Could not read the sound upload".to_owned())
    })? {
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
                        AppError::Validation(
                            "Could not read the uploaded file".to_owned(),
                        )
                    })?
                    .to_vec();
                if field_name == "audio" {
                    if bytes.is_empty() || bytes.len() > MAX_AUDIO_BYTES {
                        return Err(AppError::Validation(
                            "Audio uploads must be non-empty audio files under 50 MB".to_owned(),
                        ));
                    }
                    let mime_type =
                        validate_audio_signature(&bytes, &content_type)?;
                    audio = Some((bytes, mime_type.to_owned()));
                } else {
                    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
                        return Err(AppError::Validation(
                            "Artwork uploads must be non-empty images under 5 MB".to_owned(),
                        ));
                    }
                    let mime_type =
                        validate_image_signature(&bytes, &content_type)?;
                    image = Some((bytes, mime_type.to_owned()));
                }
            }
            "labels" => {
                labels.extend(parse_labels(&field.text().await.map_err(
                    |_| {
                        AppError::Validation("Could not read labels".to_owned())
                    },
                )?)?);
            }
            "name" => {
                name = Some(field.text().await.map_err(|_| {
                    AppError::Validation(
                        "Could not read the sound name".to_owned(),
                    )
                })?)
            }
            "audio_url" => {
                audio_url = clean_optional_url(
                    field.text().await.map_err(|_| {
                        AppError::Validation(
                            "Could not read the audio URL".to_owned(),
                        )
                    })?,
                    "audio URL",
                )?
            }
            "image_url" => {
                image_url = clean_optional_url(
                    field.text().await.map_err(|_| {
                        AppError::Validation(
                            "Could not read the artwork URL".to_owned(),
                        )
                    })?,
                    "artwork URL",
                )?
            }
            "creator_name" => {
                creator_name = clean_optional_text(
                    field.text().await.map_err(|_| {
                        AppError::Validation(
                            "Could not read the creator name".to_owned(),
                        )
                    })?,
                    160,
                )?;
            }
            "source_name" => {
                source_name = clean_optional_text(
                    field.text().await.map_err(|_| {
                        AppError::Validation(
                            "Could not read the source name".to_owned(),
                        )
                    })?,
                    160,
                )?;
            }
            "source_url" => {
                source_url = clean_optional_url(
                    field.text().await.map_err(|_| {
                        AppError::Validation(
                            "Could not read the source URL".to_owned(),
                        )
                    })?,
                    "source URL",
                )?
            }
            "source_id" => {
                let value = field.text().await.map_err(|_| {
                    AppError::Validation("Could not read the source".to_owned())
                })?;
                let value = value.trim();
                if !value.is_empty() {
                    source_id = Some(Uuid::parse_str(value).map_err(|_| {
                        AppError::Validation("Source is invalid".to_owned())
                    })?);
                }
            }
            "source_credit" => {
                source_credit = clean_optional_text(
                    field.text().await.map_err(|_| {
                        AppError::Validation(
                            "Could not read source credit".to_owned(),
                        )
                    })?,
                    800,
                )?;
            }
            _ => {}
        }
    }
    let name = name
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            AppError::Validation("Every sound needs a name".to_owned())
        })?;
    if name.len() > 160 {
        return Err(AppError::Validation(
            "Sound names cannot exceed 160 characters".to_owned(),
        ));
    }
    if audio.is_some() && audio_url.is_some() {
        return Err(AppError::Validation(
            "Choose an uploaded audio file or an audio URL, not both"
                .to_owned(),
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
        source_id,
        source_credit,
        labels,
    })
}

fn parse_labels(value: &str) -> Result<Vec<String>, AppError> {
    value
        .split([',', '\n'])
        .map(str::trim)
        .filter(|label| !label.is_empty())
        .map(|label| {
            if label.len() > 40 {
                Err(AppError::Validation(
                    "Sound labels cannot exceed 40 characters".to_owned(),
                ))
            } else {
                Ok(label.to_lowercase())
            }
        })
        .collect()
}

fn clean_optional_text(
    value: String,
    max_length: usize,
) -> Result<Option<String>, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    if value.len() > max_length {
        return Err(AppError::Validation(format!(
            "Sound metadata cannot exceed {max_length} characters"
        )));
    }
    Ok(Some(value.to_owned()))
}

fn validate_audio_signature(
    bytes: &[u8],
    declared_type: &str,
) -> Result<&'static str, AppError> {
    let detected = if bytes.starts_with(b"ID3") || looks_like_mpeg_frame(bytes)
    {
        Some("audio/mpeg")
    } else if bytes.starts_with(b"OggS") {
        Some("audio/ogg")
    } else if bytes.starts_with(b"fLaC") {
        Some("audio/flac")
    } else if bytes.len() >= 12
        && &bytes[..4] == b"RIFF"
        && &bytes[8..12] == b"WAVE"
    {
        Some("audio/wav")
    } else if bytes.len() >= 12 && &bytes[4..8] == b"ftyp" {
        Some("audio/mp4")
    } else {
        None
    };
    validate_declared_type(detected, declared_type, "audio")
}

fn validate_image_signature(
    bytes: &[u8],
    declared_type: &str,
) -> Result<&'static str, AppError> {
    let detected = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some("image/png")
    } else if bytes.starts_with(b"\xff\xd8\xff") {
        Some("image/jpeg")
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        Some("image/gif")
    } else if bytes.len() >= 12
        && &bytes[..4] == b"RIFF"
        && &bytes[8..12] == b"WEBP"
    {
        Some("image/webp")
    } else if bytes.starts_with(b"BM") {
        Some("image/bmp")
    } else if bytes.len() >= 4
        && ((&bytes[..4] == b"II*\0") || (&bytes[..4] == b"MM\0*"))
    {
        Some("image/tiff")
    } else {
        None
    };
    validate_declared_type(detected, declared_type, "image")
}

fn looks_like_mpeg_frame(bytes: &[u8]) -> bool {
    bytes.len() >= 2
        && bytes[0] == 0xff
        && (bytes[1] & 0xe0) == 0xe0
        && (bytes[1] & 0x06) != 0
}

fn validate_declared_type(
    detected: Option<&'static str>,
    declared_type: &str,
    kind: &str,
) -> Result<&'static str, AppError> {
    let Some(detected) = detected else {
        return Err(AppError::Validation(format!(
            "Uploaded {kind} format is not supported"
        )));
    };
    let declared_type = declared_type
        .split(';')
        .next()
        .unwrap_or_default()
        .trim()
        .to_ascii_lowercase();
    let matches = match detected {
        "audio/mpeg" => declared_type == "audio/mpeg",
        "audio/ogg" => {
            declared_type == "audio/ogg"
                || declared_type == "audio/opus"
                || declared_type == "application/ogg"
        }
        "audio/flac" => {
            declared_type == "audio/flac" || declared_type == "audio/x-flac"
        }
        "audio/wav" => {
            declared_type == "audio/wav"
                || declared_type == "audio/x-wav"
                || declared_type == "audio/wave"
        }
        "audio/mp4" => {
            declared_type == "audio/mp4" || declared_type == "audio/x-m4a"
        }
        "image/png" => declared_type == "image/png",
        "image/jpeg" => {
            declared_type == "image/jpeg" || declared_type == "image/jpg"
        }
        "image/gif" => declared_type == "image/gif",
        "image/webp" => declared_type == "image/webp",
        "image/bmp" => declared_type == "image/bmp",
        "image/tiff" => declared_type == "image/tiff",
        _ => false,
    };
    if !matches {
        return Err(AppError::Validation(format!(
            "Uploaded {kind} content does not match its declared type"
        )));
    }
    Ok(detected)
}

fn clean_optional_url(
    value: String,
    label: &str,
) -> Result<Option<String>, AppError> {
    let value = value.trim();
    if value.is_empty() {
        return Ok(None);
    }
    let parsed = Url::parse(value).map_err(|_| {
        AppError::Validation(format!(
            "{label} must be a valid http:// or https:// URL"
        ))
    })?;
    let authority = value
        .split_once("://")
        .map(|(_, remainder)| {
            remainder.split(['/', '?', '#']).next().unwrap_or_default()
        })
        .unwrap_or_default();
    if !matches!(parsed.scheme(), "http" | "https")
        || parsed.host_str().is_none_or(str::is_empty)
        || authority.is_empty()
    {
        return Err(AppError::Validation(format!(
            "{label} must be a valid http:// or https:// URL with a host"
        )));
    }
    if value.len() > 2_000 {
        return Err(AppError::Validation(format!("{label} is too long")));
    }
    Ok(Some(value.to_owned()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn source_metadata_is_trimmed_and_bounded() {
        let request = crate::models::SoundSourceRequest {
            name: " Tabletop Audio ".to_owned(),
            website_url: "https://tabletopaudio.com".to_owned(),
            description: " Ambient source ".to_owned(),
        };
        assert_eq!(
            validate_source(&request).unwrap(),
            (
                "Tabletop Audio".to_owned(),
                "https://tabletopaudio.com".to_owned(),
                "Ambient source".to_owned()
            )
        );
        assert!(
            validate_source(&crate::models::SoundSourceRequest {
                name: "x".repeat(161),
                website_url: "https://example.com".to_owned(),
                description: String::new(),
            })
            .is_err()
        );
    }

    #[test]
    fn urls_require_http_or_https_and_a_host() {
        for value in [
            "ftp://example.com",
            "https://",
            "https:///path",
            "https://[::1",
            "not a URL",
        ] {
            assert!(
                clean_optional_url(value.to_owned(), "URL").is_err(),
                "{value}"
            );
        }
        assert_eq!(
            clean_optional_url(
                " https://example.com/audio.mp3 ".to_owned(),
                "URL"
            )
            .unwrap(),
            Some("https://example.com/audio.mp3".to_owned())
        );
    }

    #[test]
    fn labels_are_lowercase_and_multi_valued() {
        assert_eq!(
            parse_labels("Ambiance, music\nambiance, minimal music").unwrap(),
            vec!["ambiance", "music", "ambiance", "minimal music"]
        );
    }

    #[test]
    fn metadata_and_labels_reject_oversized_values() {
        assert_eq!(
            clean_optional_text(" Creator ".to_owned(), 7).unwrap(),
            Some("Creator".to_owned())
        );
        assert_eq!(clean_optional_text("   ".to_owned(), 1).unwrap(), None);
        assert!(clean_optional_text("Creator!".to_owned(), 7).is_err());
        assert!(parse_labels(&"a".repeat(41)).is_err());
    }

    #[test]
    fn uploaded_signatures_must_match_supported_mime_types() {
        assert_eq!(
            validate_audio_signature(b"ID3audio", "audio/mpeg").unwrap(),
            "audio/mpeg"
        );
        assert_eq!(
            validate_audio_signature(b"OggSaudio", "application/ogg").unwrap(),
            "audio/ogg"
        );
        assert_eq!(
            validate_image_signature(b"\x89PNG\r\n\x1a\nimage", "image/png")
                .unwrap(),
            "image/png"
        );
        assert!(validate_audio_signature(b"ID3audio", "audio/ogg").is_err());
        assert!(
            validate_image_signature(b"not an image", "image/png").is_err()
        );
    }
}
