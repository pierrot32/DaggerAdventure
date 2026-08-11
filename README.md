# DaggerAdventure

DaggerAdventure is a DaggerHeart companion application for creating and managing adventures. It is also a hands-on project covering React, Rust, PostgreSQL, Docker, Jenkins, and Argo CD.

For a complete server installation, see [INSTALLATION.md](INSTALLATION.md). This file focuses on the project structure, local usage, and the development workflow.

## Project structure

| Path | Responsibility |
|---|---|
| `frontend/` | React 19 and Vite client application. |
| `frontend/src/` | React components, application styles, and browser entry point. |
| `backend/` | Rust workspace package containing the API binary and library. |
| `backend/src/routes/` | Axum HTTP endpoints for health checks and authentication. |
| `backend/src/services/` | Authentication and password logic. |
| `backend/src/repository/` | Database access code. |
| `backend/src/models/` | Request and response types. |
| `backend/migrations/` | SQLx migrations applied automatically when the API starts. |
| `backend/tests/` | PostgreSQL-backed authentication integration tests. |
| `k8s/` | Kubernetes Deployments, Services, Ingress, and PostgreSQL manifests. |
| `argo/` | k3s bootstrap image and Argo CD installation script. |
| `nginx/` | TLS reverse-proxy templates and certificate bootstrap script. |
| `jenkins/` | Jenkins image used by the CI pipeline. |
| `Jenkinsfile` | Container checks, image builds, smoke tests, and registry publishing. |
| `docker-compose.yml` | Local PostgreSQL and self-hosted deployment services. |

## How the pieces work

The frontend talks to the Rust API. The API connects to PostgreSQL, runs pending migrations, and exposes the authentication routes. In a deployed environment, Kubernetes runs the frontend, backend, and PostgreSQL services; the ingress exposes the application. Argo CD watches the Kubernetes manifests and keeps the cluster synchronized with Git.

Jenkins builds the frontend and backend check targets, builds both production images, runs `/healthz` and `/api/hello` smoke tests, and publishes immutable images. A successful build from `main` updates one reusable promotion branch with the tested image tags and opens or updates a pull request into `production`. After that pull request is merged, Argo CD deploys the `k8s/` manifests from `production`.

## Local usage

### Start PostgreSQL

Create the root environment file and set a local database password:

```bash
cp .env.example .env
docker compose up -d postgres
```

Create `backend/.env` with credentials for that database:

```dotenv
DATABASE_URL=postgres://dagger_adventure:change_me_locally@127.0.0.1:5432/dagger_adventure
JWT_SECRET=replace_with_a_long_local_secret
COOKIE_SECURE=false
PORT=8080
OPENAI_API_KEY=replace_with_your_openai_key
OPENAI_MODEL=gpt-5.6-luna
```

The backend loads this file with `dotenvy`, connects to PostgreSQL, and applies migrations on startup.
The OpenAI key is read only by the backend and is never exposed to the frontend. Keep it in the
untracked `backend/.env` file locally or in the Kubernetes Secret described below.

### Run the backend

```bash
cd backend
cargo run
```

The API listens on `http://localhost:8080` by default. Useful endpoints are:

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness check. |
| `POST /api/auth/register` | Create an account. |
| `POST /api/auth/login` | Authenticate and set the HTTP-only cookie. |
| `POST /api/auth/logout` | Clear the authentication cookie. |
| `GET /api/auth/me` | Return the current authenticated user. |
| `GET /api/hello` | Authenticated API smoke-test endpoint. |
| `POST /api/ai/generate` | Generate character material for an admin or explicitly granted account. |
| `POST /api/ai/character` | Generate only unlocked character fields using the current locked context. |
| `GET /api/admin/ai-logs` | Admin-only request and response history for AI generation. |

### Run the frontend

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Vite serves the development client at the URL shown in the terminal, normally `http://localhost:5173`.

## Test and validation commands

Run the backend checks from `backend/`:

```bash
cargo fmt -- --check
cargo check
cargo test
```

The default backend test command runs the unit tests. PostgreSQL integration tests use SQLx's disposable per-test databases and require a Postgres role that can create databases:

```bash
DATABASE_URL="postgres://dagger_adventure:<password>@127.0.0.1:5432/dagger_adventure" \
  cargo test --tests -- --ignored
```

Use a URL-encoded password when it contains URL-special characters. The integration suite creates an isolated database for every test and includes content validation, admin route authorization, schema-drift, and migration reversibility coverage.

Run the frontend checks from `frontend/`:

```bash
npm run lint
npm run build
```

The repository does not currently define a frontend unit-test runner. `npm run lint` and `npm run build` are the available automated frontend checks.

To reproduce the Docker checks used by Jenkins from the repository root:

```bash
docker build --target checks -t dagger-backend-check:local ./backend
docker build --target checks -t dagger-frontend-check:local ./frontend
```

## Deployment

The full Docker Compose deployment includes Jenkins, Docker-in-Docker, nginx, Certbot, k3s, Argo CD, and PostgreSQL. The application manifests are under `k8s/`; the Argo CD Application in `argo/app-dagger-adventure.yaml` points Argo CD at those manifests.

Before deploying, replace the repository and image placeholders in the Argo CD and Kubernetes manifests, create the required Kubernetes secrets, and configure the domains. Follow [INSTALLATION.md](INSTALLATION.md) for the complete sequence.

