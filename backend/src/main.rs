use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use axum::{
    Json, Router,
    extract::State,
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};
use rand::{RngCore, rngs::OsRng};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    env,
    net::SocketAddr,
    sync::{Arc, Mutex},
    time::{SystemTime, UNIX_EPOCH},
};

const SESSION_LENGTH_SECONDS: i64 = 60 * 60 * 24 * 7;

#[derive(Clone)]
struct AppState {
    database: Arc<Mutex<Connection>>,
    cookie_secure: bool,
}

#[derive(Deserialize)]
struct RegisterRequest {
    email: String,
    name: String,
    password: String,
}

#[derive(Deserialize)]
struct LoginRequest {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct UserResponse {
    id: i64,
    email: String,
    name: String,
}

#[derive(Serialize)]
struct MessageResponse {
    message: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("system clock is before Unix epoch")
        .as_secs() as i64
}

fn initialize_database(path: &str) -> Connection {
    if let Some(parent) = std::path::Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).expect("unable to create database directory");
        }
    }

    let connection = Connection::open(path).expect("unable to open SQLite database");
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             CREATE TABLE IF NOT EXISTS users (
                 id INTEGER PRIMARY KEY,
                 email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                 name TEXT NOT NULL,
                 password_hash TEXT NOT NULL,
                 created_at INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS sessions (
                 token_hash BLOB PRIMARY KEY,
                 user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                 expires_at INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);",
        )
        .expect("unable to initialize SQLite database");
    connection
}

fn json_response<T: Serialize>(status: StatusCode, value: &T) -> Response {
    let body = serde_json::to_vec(value).expect("response should serialize");
    (status, [(header::CONTENT_TYPE, "application/json")], body).into_response()
}

fn cookie_response<T: Serialize>(status: StatusCode, value: &T, cookie: String) -> Response {
    let mut response = json_response(status, value);
    response.headers_mut().insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).expect("session cookie should be a valid header"),
    );
    response
}

fn error(status: StatusCode, message: &str) -> Response {
    json_response(
        status,
        &ErrorResponse {
            error: message.to_owned(),
        },
    )
}

fn hash_password(password: &str) -> Result<String, ()> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| ())
}

fn verify_password(password: &str, password_hash: &str) -> bool {
    PasswordHash::new(password_hash)
        .map(|parsed| {
            Argon2::default()
                .verify_password(password.as_bytes(), &parsed)
                .is_ok()
        })
        .unwrap_or(false)
}

fn session_token() -> (String, Vec<u8>) {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    let token = URL_SAFE_NO_PAD.encode(bytes);
    (token.clone(), token_hash(&token))
}

fn token_hash(token: &str) -> Vec<u8> {
    Sha256::digest(token.as_bytes()).to_vec()
}

fn session_cookie(token: &str, secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!(
        "auth_session={token}; Path=/; Max-Age={SESSION_LENGTH_SECONDS}; HttpOnly; SameSite=Lax{secure_flag}"
    )
}

fn expired_cookie(secure: bool) -> String {
    let secure_flag = if secure { "; Secure" } else { "" };
    format!("auth_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax{secure_flag}")
}

fn cookie_token(headers: &HeaderMap) -> Option<String> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .find_map(|part| part.trim().strip_prefix("auth_session=").map(str::to_owned))
}

fn create_session(connection: &Connection, user_id: i64) -> Result<String, rusqlite::Error> {
    connection.execute(
        "DELETE FROM sessions WHERE expires_at <= ?1",
        params![now()],
    )?;
    let (token, hash) = session_token();
    connection.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?1, ?2, ?3)",
        params![hash, user_id, now() + SESSION_LENGTH_SECONDS],
    )?;
    Ok(token)
}

fn user_from_session(
    connection: &Connection,
    token: &str,
) -> Result<Option<UserResponse>, rusqlite::Error> {
    connection
        .query_row(
            "SELECT users.id, users.email, users.name
             FROM sessions JOIN users ON users.id = sessions.user_id
             WHERE sessions.token_hash = ?1 AND sessions.expires_at > ?2",
            params![token_hash(token), now()],
            |row| {
                Ok(UserResponse {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    name: row.get(2)?,
                })
            },
        )
        .optional()
}

fn authenticated_user(headers: &HeaderMap, state: &AppState) -> Option<UserResponse> {
    let token = cookie_token(headers)?;
    let connection = state.database.lock().ok()?;
    user_from_session(&connection, &token).ok().flatten()
}

async fn register(State(state): State<AppState>, Json(request): Json<RegisterRequest>) -> Response {
    let email = request.email.trim().to_lowercase();
    let name = request.name.trim().to_owned();
    if !email.contains('@') || email.len() > 254 {
        return error(StatusCode::BAD_REQUEST, "Enter a valid email address");
    }
    if name.is_empty() || name.chars().count() > 80 {
        return error(
            StatusCode::BAD_REQUEST,
            "Name must be between 1 and 80 characters",
        );
    }
    if request.password.chars().count() < 8 {
        return error(
            StatusCode::BAD_REQUEST,
            "Password must be at least 8 characters",
        );
    }

    let Ok(password_hash) = hash_password(&request.password) else {
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to create account",
        );
    };
    let Ok(connection) = state.database.lock() else {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable");
    };
    let result = connection.execute(
        "INSERT INTO users (email, name, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)",
        params![email, name, password_hash, now()],
    );
    if result.is_err() {
        return error(
            StatusCode::CONFLICT,
            "An account with that email already exists",
        );
    }

    let user_id = connection.last_insert_rowid();
    let Ok(token) = create_session(&connection, user_id) else {
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to create session",
        );
    };
    let user = UserResponse {
        id: user_id,
        email,
        name,
    };
    cookie_response(
        StatusCode::CREATED,
        &user,
        session_cookie(&token, state.cookie_secure),
    )
}

async fn login(State(state): State<AppState>, Json(request): Json<LoginRequest>) -> Response {
    let email = request.email.trim().to_lowercase();
    let Ok(connection) = state.database.lock() else {
        return error(StatusCode::INTERNAL_SERVER_ERROR, "Database unavailable");
    };
    let user = connection
        .query_row(
            "SELECT id, email, name, password_hash FROM users WHERE email = ?1",
            params![email],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional();
    let Ok(Some((id, stored_email, name, password_hash))) = user else {
        return error(StatusCode::UNAUTHORIZED, "Invalid email or password");
    };
    if !verify_password(&request.password, &password_hash) {
        return error(StatusCode::UNAUTHORIZED, "Invalid email or password");
    }
    let Ok(token) = create_session(&connection, id) else {
        return error(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Unable to create session",
        );
    };
    let user = UserResponse {
        id,
        email: stored_email,
        name,
    };
    cookie_response(
        StatusCode::OK,
        &user,
        session_cookie(&token, state.cookie_secure),
    )
}

async fn current_user(State(state): State<AppState>, headers: HeaderMap) -> Response {
    match authenticated_user(&headers, &state) {
        Some(user) => json_response(StatusCode::OK, &user),
        None => error(StatusCode::UNAUTHORIZED, "Not signed in"),
    }
}

async fn logout(State(state): State<AppState>, headers: HeaderMap) -> Response {
    if let Some(token) = cookie_token(&headers) {
        if let Ok(connection) = state.database.lock() {
            let _ = connection.execute(
                "DELETE FROM sessions WHERE token_hash = ?1",
                params![token_hash(&token)],
            );
        }
    }
    cookie_response(
        StatusCode::OK,
        &MessageResponse {
            message: "Signed out".to_owned(),
        },
        expired_cookie(state.cookie_secure),
    )
}

async fn hello(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let Some(user) = authenticated_user(&headers, &state) else {
        return error(StatusCode::UNAUTHORIZED, "Sign in to access the adventure");
    };
    json_response(
        StatusCode::OK,
        &MessageResponse {
            message: format!("Welcome, {}", user.name),
        },
    )
}

#[tokio::main]
async fn main() {
    let database_path = env::var("DATABASE_PATH").unwrap_or_else(|_| "./data/app.db".to_owned());
    let cookie_secure = env::var("COOKIE_SECURE")
        .map(|value| value.eq_ignore_ascii_case("true"))
        .unwrap_or(false);
    let state = AppState {
        database: Arc::new(Mutex::new(initialize_database(&database_path))),
        cookie_secure,
    };

    let app = Router::new()
        .route("/healthz", get(|| async { "OK" }))
        .route("/api/hello", get(hello))
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(login))
        .route("/api/auth/me", get(current_user))
        .route("/api/auth/logout", post(logout))
        .with_state(state);

    let addr = SocketAddr::from(([0, 0, 0, 0], 8080));
    println!("Server running on http://{}", addr);

    axum::Server::bind(&addr)
        .serve(app.into_make_service())
        .await
        .unwrap();
}
