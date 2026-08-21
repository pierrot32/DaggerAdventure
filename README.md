# DaggerAdventure

DaggerAdventure is a companion application for creating and managing adventures. It is also a hands-on project covering React, Rust, PostgreSQL, Docker, Jenkins, and Argo CD.

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
# Generate with: openssl rand -hex 32
JWT_SECRET=replace_with_at_least_32_random_bytes
COOKIE_SECURE=false
PORT=8080
TRUST_PROXY_HEADERS=false
EMAIL_PROVIDER=disabled
EMAIL_FROM=no-reply@localhost
# Optional local-only delivery:
# EMAIL_PROVIDER=dev_file
# EMAIL_DEV_OUTBOX=/tmp/dagger-adventure-verification-mails.txt
# EMAIL_VERIFICATION_BASE_URL=http://localhost:5173/verify-email
OPENAI_API_KEY=replace_with_your_openai_key
OPENAI_MODEL=gpt-5.6-luna
```

The backend loads this file with `dotenvy`, connects to PostgreSQL, and applies migrations on startup.
The OpenAI key is read only by the backend and is never exposed to the frontend. Keep it in the
untracked `backend/.env` file locally or in the Kubernetes Secret described below.

New accounts receive no session cookie until email verification succeeds. New registrations
set `email_verification_required=true`. The `0022_add_email_verification_required` migration
defaults that flag to `false` for existing rows, leaves their `email_verified_at` values NULL,
and explicitly grandfathers those legacy accounts so the rollout does not lock them out or
silently mark them verified. Legacy accounts remain grandfathered until a future explicit
enforcement migration or admin operation changes the flag; admin approval and access levels
remain independent of email verification.

The safe default
`EMAIL_PROVIDER=disabled` rejects new registrations with `503 Service Unavailable` before an
account is created; it never creates an account that cannot receive a verification link. For
local development, use `EMAIL_PROVIDER=dev_file` with an untracked `EMAIL_DEV_OUTBOX` path and
`EMAIL_VERIFICATION_BASE_URL`; this is an append-only development outbox. Production deployments
can use `EMAIL_PROVIDER=smtp` with `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`,
`EMAIL_SMTP_USERNAME`, `EMAIL_SMTP_PASSWORD`, and `EMAIL_SMTP_TLS`; SMTP credentials must be
provided out of band. Delivery is attempted only after the account and hashed token commit, and
a transient delivery failure returns `503` without exposing the token; resend inserts another
hashed, one-use token without deleting still-valid tokens, cleans up at most 50 expired tokens for
that user, and can recover the existing unverified account once delivery is available. A
successful resend also leaves earlier valid links usable. Verification links carry the token in
the URL fragment, which browsers do not send in the initial HTTP request; the verification page
removes the fragment immediately before making the API request. The verification page and
endpoint use `Referrer-Policy: no-referrer` and `Cache-Control: no-store`. The backend rate
limiter uses PostgreSQL so limits are shared across replicas. Keep `TRUST_PROXY_HEADERS=false`
unless a trusted reverse proxy chain is configured and verified to replace client-forwarding
headers. In the bundled Kubernetes deployment, the outer nginx overwrites `X-Forwarded-For` and `X-Real-IP`, the Argo
installer configures ingress-nginx with `use-forwarded-headers=true`, and the backend explicitly
enables trust for that private chain. Do not expose the ingress NodePort or backend service
directly, and do not copy that setting to a deployment whose proxies can pass through
client-supplied headers.

### Run the backend

```bash
cd backend
cargo run
```

The API listens on `http://localhost:8080` by default. Useful endpoints are:

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | Liveness check. |
| `POST /api/auth/register` | Create an account and return a generic verification-pending response. |
| `POST /api/auth/login` | Authenticate verified accounts and set the HTTP-only cookie. |
| `POST /api/auth/verify-email` | Consume a one-use verification token. |
| `POST /api/auth/resend-verification` | Return a generic verification-resend response. |
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

Use a URL-encoded password when it contains URL-special characters. The integration suite creates an isolated database for every test and includes content validation, admin route authorization, migration reversibility, and fictional example-book coverage. The upload-ready example is [examples/example-book.json](examples/example-book.json); it contains no SRD data.

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

The full Docker Compose deployment includes Jenkins, Docker-in-Docker, nginx, Certbot, k3s, Argo CD, and PostgreSQL. The application manifests are under `k8s/`; the Argo CD Application in `argo/app-dagger-adventure.yaml` points Argo CD at those manifests. The bundled Kubernetes backend explicitly keeps email delivery disabled, so registrations return `503` until a production email provider implementation is added and the operator supplies its non-secret configuration and delivery credentials through the deployment's secret-management system. No provider credentials are committed here.

Before deploying, replace the repository and image placeholders in the Argo CD and Kubernetes manifests, create the required Kubernetes secrets, and configure the domains. Follow [INSTALLATION.md](INSTALLATION.md) for the complete sequence.

