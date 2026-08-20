use axum::{
    Json,
    http::StatusCode,
    response::{IntoResponse, Response},
};
use serde::Serialize;

#[derive(Debug)]
pub enum AppError {
    Validation(String),
    Conflict(String),
    RateLimited { message: String, retry_after: u64 },
    Unauthorized(String),
    Forbidden(String),
    NotFound(String),
    ServiceUnavailable(String),
    Internal(String),
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::Validation(message) => (StatusCode::BAD_REQUEST, message),
            AppError::Conflict(message) => (StatusCode::CONFLICT, message),
            AppError::RateLimited {
                message,
                retry_after,
            } => {
                let mut response = (
                    StatusCode::TOO_MANY_REQUESTS,
                    Json(ErrorBody { error: message }),
                )
                    .into_response();
                response.headers_mut().insert(
                    axum::http::header::RETRY_AFTER,
                    retry_after
                        .to_string()
                        .parse()
                        .expect("retry-after is numeric"),
                );
                return response;
            }
            AppError::Unauthorized(message) => {
                (StatusCode::UNAUTHORIZED, message)
            }
            AppError::Forbidden(message) => (StatusCode::FORBIDDEN, message),
            AppError::NotFound(message) => (StatusCode::NOT_FOUND, message),
            AppError::ServiceUnavailable(message) => {
                (StatusCode::SERVICE_UNAVAILABLE, message)
            }
            AppError::Internal(message) => {
                // Never leak internal error details to the client.
                eprintln!("internal error: {message}");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "Something went wrong".to_owned(),
                )
            }
        };
        (status, Json(ErrorBody { error: message })).into_response()
    }
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        AppError::Internal(error.to_string())
    }
}
