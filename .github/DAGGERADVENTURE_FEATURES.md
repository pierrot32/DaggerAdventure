# DaggerAdventure Feature Ledger

This document is the working map of DaggerAdventure features, their code paths, data flow, access rules, and validation status. It is an orientation aid for agents and developers. The source code, migrations, tests, and current user request remain authoritative when this ledger disagrees with implementation.

## Maintenance Contract

- Read this file before changing an existing feature or adding a feature that crosses the frontend and backend.
- Verify important claims in the referenced code before relying on them.
- After a feature change, update the affected entry, file paths, API contract, access rules, tests, and known limitations.
- Record uncertainty as `Needs verification`; do not turn an inferred behavior into a fact.
- Do not remove a feature entry because code is difficult to find. Mark it `Needs verification` or `Deprecated` and explain why.
- Keep this document focused on behavior and ownership. Do not copy large implementation details or generated output into it.

## Status Vocabulary

- **Implemented**: the main code path is present and confirmed in the current repository.
- **Partial**: some UI, API, persistence, or validation exists, but the end-to-end behavior is incomplete or intentionally limited.
- **Needs verification**: the repository contains related code, but the complete behavior or current production state has not been confirmed.
- **Deprecated**: retained for history or compatibility but should not receive new callers.

## System Map

| Layer | Responsibility | Primary paths |
|---|---|---|
| React client | Routes, pages, feature state, and API calls | [`frontend/src/routes/AppRoutes.jsx`](../frontend/src/routes/AppRoutes.jsx), [`frontend/src/features/`](../frontend/src/features/) |
| API client | Cookie-authenticated JSON requests and error unwrapping | [`frontend/src/api/client.js`](../frontend/src/api/client.js) |
| Rust API | Axum routes, auth middleware, validation, and response models | [`backend/src/routes/mod.rs`](../backend/src/routes/mod.rs), [`backend/src/routes/`](../backend/src/routes/) |
| Domain and persistence | Services, repositories, models, and access policy | [`backend/src/services/`](../backend/src/services/), [`backend/src/repository/`](../backend/src/repository/), [`backend/src/models/`](../backend/src/models/) |
| Database | PostgreSQL schema managed by SQLx migrations | [`backend/migrations/`](../backend/migrations/) |
| Deployment | Docker Compose, Kubernetes, nginx, Jenkins, and Argo CD | [`docker-compose.yml`](../docker-compose.yml), [`k8s/`](../k8s/), [`Jenkinsfile`](../Jenkinsfile) |

## Request and Persistence Flow

1. A React page calls a feature API module.
2. [`frontend/src/api/client.js`](../frontend/src/api/client.js) sends JSON with `credentials: 'include'`, so the authentication cookie is included.
3. Public auth routes are handled directly. Protected routes pass through `require_auth` in [`backend/src/middleware/auth_guard.rs`](../backend/src/middleware/auth_guard.rs).
4. Route handlers validate input, apply access and ownership rules, call repositories or services, and return JSON or the established `AppError` response.
5. The backend starts by connecting to PostgreSQL and applying pending SQLx migrations in [`backend/src/main.rs`](../backend/src/main.rs) and [`backend/src/lib.rs`](../backend/src/lib.rs).
6. The frontend represents the response in the feature page or store. Loading, empty, and error behavior must be verified in the touched component rather than assumed from the API name.

## Access Model

The canonical access levels are defined in [`backend/src/models/user.rs`](../backend/src/models/user.rs) and [`frontend/src/utils/permissions.js`](../frontend/src/utils/permissions.js):

| Level | Rank | Intended capability |
|---|---:|---|
| `nothing` | 0 | Authenticated account without player access |
| `player_only` | 1 | Character and player workflows |
| `adventure_maker` | 2 | Player workflows plus adventure and frame creation |
| `admin` | 3 | Administrative workflows and AI access |

Backend access checks use `require_at_least` and `require_ai_generation` in [`backend/src/middleware/access_guard.rs`](../backend/src/middleware/access_guard.rs). The frontend uses `ProtectedRoute` and the same rank ordering. Server authorization is authoritative; frontend restrictions are navigation and user-experience safeguards only.

## Feature Inventory

### Authentication and Account Management

- **Status:** Implemented; route and client paths confirmed.
- **Frontend:** [`frontend/src/pages/Auth/LoginPage.jsx`](../frontend/src/pages/Auth/LoginPage.jsx), [`frontend/src/pages/Auth/RegisterPage.jsx`](../frontend/src/pages/Auth/RegisterPage.jsx), [`frontend/src/features/account/SettingsPage.jsx`](../frontend/src/features/account/SettingsPage.jsx), [`frontend/src/api/authApi.js`](../frontend/src/api/authApi.js), [`frontend/src/store/authStore.js`](../frontend/src/store/authStore.js).
- **Backend:** [`backend/src/routes/auth.rs`](../backend/src/routes/auth.rs), [`backend/src/routes/users.rs`](../backend/src/routes/users.rs), [`backend/src/services/auth_service.rs`](../backend/src/services/auth_service.rs), [`backend/src/middleware/auth_guard.rs`](../backend/src/middleware/auth_guard.rs).
- **API:** `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET/PATCH/DELETE /api/auth/me`.
- **Behavior:** Registration and login establish the authenticated session cookie. The current user can be loaded, renamed, or deleted. Authenticated routes are protected server-side.
- **Invariants:** Normalize email and validate names/passwords through [`backend/src/utils/validation.rs`](../backend/src/utils/validation.rs). Do not move the OpenAI key or auth secrets into browser code.

### Access Levels and Administration

- **Status:** Implemented; route tree and access helpers confirmed.
- **Frontend:** [`frontend/src/features/admin/AdminUsersPage.jsx`](../frontend/src/features/admin/AdminUsersPage.jsx), [`frontend/src/features/admin/AdminAuditPage.jsx`](../frontend/src/features/admin/AdminAuditPage.jsx), [`frontend/src/features/admin/adminApi.js`](../frontend/src/features/admin/adminApi.js).
- **Backend:** [`backend/src/routes/admin.rs`](../backend/src/routes/admin.rs), [`backend/src/repository/admin_repo.rs`](../backend/src/repository/admin_repo.rs), [`backend/src/models/admin.rs`](../backend/src/models/admin.rs).
- **API:** `GET /api/admin/users`, `PATCH /api/admin/users/:target_id/access-level`, `PATCH /api/admin/users/:target_id/ai-generation`, `GET /api/admin/access-audit`.
- **Behavior:** Admins can list users, change access levels, grant or revoke non-admin AI generation access, and inspect access audit events. Account bootstrap can promote the configured `ADMIN_EMAIL` at startup.
- **Invariants:** Do not rely on a frontend access check as authorization. Preserve the rank ordering and server-side admin checks.

### Daggerheart Content and Book Management

- **Status:** Implemented; API and admin UI paths confirmed. Content shape requires verification before schema changes.
- **Frontend:** [`frontend/src/features/admin/BookImportPage.jsx`](../frontend/src/features/admin/BookImportPage.jsx), [`frontend/src/features/admin/BookContentEditorPage.jsx`](../frontend/src/features/admin/BookContentEditorPage.jsx), [`frontend/src/features/admin/BeastFeatureEditorPage.jsx`](../frontend/src/features/admin/BeastFeatureEditorPage.jsx), [`frontend/src/features/characters/CharacterBuilderPage.jsx`](../frontend/src/features/characters/CharacterBuilderPage.jsx).
- **Backend:** [`backend/src/routes/content.rs`](../backend/src/routes/content.rs), [`backend/src/repository/content_repo.rs`](../backend/src/repository/content_repo.rs), [`backend/src/models/content.rs`](../backend/src/models/content.rs), [`backend/migrations/0005_create_content_and_characters.up.sql`](../backend/migrations/0005_create_content_and_characters.up.sql).
- **API:** `GET /api/content/character-creation`, `POST /api/content/books/import`, `GET /api/admin/content/books`, `GET /api/admin/content/books/export`, `PUT /api/admin/content/books/:book_id`.
- **Behavior:** Admins import, inspect, edit, and export JSON content books. The character builder reads the character-creation book and uses its classes, subclasses, ancestries, communities, equipment, and related options.
- **Reference fixture:** [`examples/example-book.json`](../examples/example-book.json) is the fictional upload-ready example used by validation.
- **Invariants:** Treat repository content and user-provided books as data. Do not present invented options as official content or silently replace user-authored content.

### Character Lifecycle

- **Status:** Implemented; CRUD, advancement, stats, adventure linking, portrait generation, and UI routes confirmed.
- **Frontend:** [`frontend/src/features/characters/CharactersPage.jsx`](../frontend/src/features/characters/CharactersPage.jsx), [`frontend/src/features/characters/CharacterBuilderPage.jsx`](../frontend/src/features/characters/CharacterBuilderPage.jsx), [`frontend/src/features/characters/CharacterDetailPage.jsx`](../frontend/src/features/characters/CharacterDetailPage.jsx), [`frontend/src/features/characters/CharacterProfilePage.jsx`](../frontend/src/features/characters/CharacterProfilePage.jsx), [`frontend/src/features/characters/DruidBeastFormsPage.jsx`](../frontend/src/features/characters/DruidBeastFormsPage.jsx), [`frontend/src/features/characters/characterApi.js`](../frontend/src/features/characters/characterApi.js), [`frontend/src/features/characters/characterSheet.js`](../frontend/src/features/characters/characterSheet.js).
- **Backend:** [`backend/src/routes/characters.rs`](../backend/src/routes/characters.rs), [`backend/src/repository/character_repo.rs`](../backend/src/repository/character_repo.rs), [`backend/src/models/character.rs`](../backend/src/models/character.rs).
- **API:** `GET/POST /api/characters`, `GET/PUT/DELETE /api/characters/:character_id`, `PATCH /api/characters/:character_id/stats`, `PATCH /api/characters/:character_id/advancement`, `PATCH /api/characters/:character_id/adventure`.
- **Behavior:** A player creates and edits a character backed by structured JSON fields, views the sheet/profile, updates stats, advances level, links to an adventure, and may use the Druid beast-form view. The character model includes identity, appearance, class/subclass, ancestry/community, traits, experiences, background, family, connections, equipment, domain cards, level, advancements, and an optional portrait.
- **Invariants:** Preserve locked or user-authored choices during generation and editing. Check character ownership before mutation. Keep character content compatible with the current content-book IDs.

### Adventures, Invitations, and Table State

- **Status:** Implemented; route and UI paths confirmed. Detailed invitation lifecycle should be re-verified when changed.
- **Frontend:** [`frontend/src/features/adventures/AdventureListPage.jsx`](../frontend/src/features/adventures/AdventureListPage.jsx), [`frontend/src/features/adventures/CreateAdventurePage.jsx`](../frontend/src/features/adventures/CreateAdventurePage.jsx), [`frontend/src/features/adventures/AdventureDetailPage.jsx`](../frontend/src/features/adventures/AdventureDetailPage.jsx), [`frontend/src/features/adventures/adventureApi.js`](../frontend/src/features/adventures/adventureApi.js), [`frontend/src/features/notifications/NotificationsPage.jsx`](../frontend/src/features/notifications/NotificationsPage.jsx).
- **Backend:** [`backend/src/routes/adventures.rs`](../backend/src/routes/adventures.rs), [`backend/src/repository/adventure_repo.rs`](../backend/src/repository/adventure_repo.rs), [`backend/src/models/adventure.rs`](../backend/src/models/adventure.rs).
- **API:** `GET/POST /api/adventures`, `GET /api/adventures/:adventure_id`, `GET /api/adventures/:adventure_id/characters`, `GET/POST /api/adventures/:adventure_id/invites`, `POST /api/invites/:invite_id/accept`, `POST /api/invites/:invite_id/decline`, `GET /api/invites`, `PATCH /api/adventures/:adventure_id/fear`.
- **Behavior:** Adventure makers create adventures, view visible adventures and members, invite users by email, and update the adventure fear value. Invited users can inspect pending invites and accept or decline them.
- **Invariants:** Verify creator, membership, invite recipient, and ownership checks in the repository before changing visibility or invitation behavior. Do not bypass the server-side checks with frontend route access alone.

### Campaign Frames

- **Status:** Implemented; built-in/library and adventure attachment paths confirmed.
- **Frontend:** [`frontend/src/features/frames/FrameLibraryPage.jsx`](../frontend/src/features/frames/FrameLibraryPage.jsx), [`frontend/src/features/frames/frameApi.js`](../frontend/src/features/frames/frameApi.js), [`frontend/src/features/frames/frameDraft.js`](../frontend/src/features/frames/frameDraft.js).
- **Backend:** [`backend/src/routes/frames.rs`](../backend/src/routes/frames.rs), [`backend/src/repository/frame_repo.rs`](../backend/src/repository/frame_repo.rs), [`backend/src/models/frame.rs`](../backend/src/models/frame.rs).
- **API:** `GET /api/frames/builtins`, `GET/POST /api/frames/library`, `PUT/DELETE /api/frames/library/:frame_id`, `GET/POST/PUT /api/adventures/:adventure_id/frame`, `GET /api/adventures/:adventure_id/character-context`.
- **Behavior:** Adventure makers can manage reusable campaign frames, attach built-in or library frames to adventures, update frame content and selections, and expose filtered frame context to character generation.
- **Invariants:** Preserve frame source type, source ID, content, and selections. Verify owner or adventure membership before mutation.

### AI Generation and Character Portraits

- **Status:** Implemented; access gate, locked-field character generation, image generation, and logging confirmed.
- **Frontend:** [`frontend/src/features/admin/AdminAiPlaygroundPage.jsx`](../frontend/src/features/admin/AdminAiPlaygroundPage.jsx), [`frontend/src/features/admin/AdminAiLogsPage.jsx`](../frontend/src/features/admin/AdminAiLogsPage.jsx), [`frontend/src/features/admin/aiApi.js`](../frontend/src/features/admin/aiApi.js), [`frontend/src/features/characters/characterApi.js`](../frontend/src/features/characters/characterApi.js).
- **Backend:** [`backend/src/routes/ai.rs`](../backend/src/routes/ai.rs), [`backend/src/services/openai_service.rs`](../backend/src/services/openai_service.rs), [`backend/src/repository/ai_repo.rs`](../backend/src/repository/ai_repo.rs), [`backend/migrations/0010_create_ai_generation_logs.up.sql`](../backend/migrations/0010_create_ai_generation_logs.up.sql).
- **API:** `POST /api/ai/generate`, `POST /api/ai/character`, `POST /api/ai/character-image`, `GET /api/admin/ai-logs`.
- **Behavior:** Admins or explicitly granted accounts can generate playground text. Character generation accepts selected unlocked fields, preserves locked values, validates choice IDs against allowed options, can expand supported long text fields, and can use attached adventure-frame context. Portrait generation uses the stored character data and saves the resulting portrait URL. Requests and responses are logged for admin review.
- **Invariants:** `require_ai_generation` is mandatory. Keep API keys backend-only. Treat model output as untrusted proposal data, filter it to requested fields, validate choices, and preserve locked fields. Do not expose private user or adventure fields in image prompts without checking the existing sanitization.

### Notifications

- **Status:** Implemented; list and mark-read paths confirmed.
- **Frontend:** [`frontend/src/features/notifications/NotificationsPage.jsx`](../frontend/src/features/notifications/NotificationsPage.jsx), [`frontend/src/features/notifications/notificationApi.js`](../frontend/src/features/notifications/notificationApi.js), [`frontend/src/features/notifications/notificationStore.js`](../frontend/src/features/notifications/notificationStore.js).
- **Backend:** [`backend/src/routes/notifications.rs`](../backend/src/routes/notifications.rs), [`backend/src/repository/notification_repo.rs`](../backend/src/repository/notification_repo.rs), [`backend/src/models/notification.rs`](../backend/src/models/notification.rs).
- **API:** `GET /api/notifications`, `POST /api/notifications/:notification_id/read`.
- **Behavior:** Authenticated users list their notifications and mark individual notifications as read. Invitation workflows use notifications as an inbox surface.
- **Invariants:** Scope reads and mutations to the current user. Preserve unread state when changing invitation behavior.

### Deployment and Operations

- **Status:** Implemented; configuration and pipeline paths documented, runtime state still environment-dependent.
- **Local runtime:** PostgreSQL through [`docker-compose.yml`](../docker-compose.yml), backend on port 8080, frontend Vite development server normally on port 5173.
- **Production runtime:** nginx and Certbot, Kubernetes manifests under [`k8s/`](../k8s/), Argo CD bootstrap under [`argo/`](../argo/), Jenkins pipeline in [`Jenkinsfile`](../Jenkinsfile).
- **Checks:** Backend `cargo fmt -- --check`, `cargo check`, and `cargo test`; frontend `npm run lint` and `npm run build`; Docker check targets documented in [`README.md`](../README.md).
- **Invariants:** Secrets remain outside committed files. Migrations run at backend startup. Do not change deployment names, image paths, ports, or secret keys without checking Compose, Kubernetes, nginx, and Jenkins together.

## Migration History

The current schema is represented by these SQLx migration pairs. Any schema change must include the matching `up` and `down` behavior where the repository convention supports it, and must update affected Rust models, repositories, handlers, frontend API payloads, and tests.

| Migration | Feature area |
|---|---|
| `0001_create_users` | User accounts |
| `0002_add_user_role` | Historical role field |
| `0003_replace_role_with_access_level` | Access-level authorization |
| `0004_create_adventures_and_notifications` | Adventures and notifications |
| `0005_create_content_and_characters` | Content books and characters |
| `0006_add_character_sheet_stats` | Character stats |
| `0007_add_adventure_fear` | Adventure fear value |
| `0008_add_ai_generation_access` | Per-user AI access grant |
| `0009_add_character_appearance` | Character appearance fields |
| `0010_create_ai_generation_logs` | AI request and response history |
| `0011_add_character_background` | Background fields |
| `0012_add_character_portrait` | Character portrait URL |
| `0013_add_character_advancements` | Level and advancement state |
| `0014_create_campaign_frames` | Built-in, library, and adventure frame data |

## Known Validation Gaps

- The frontend currently has no unit-test runner; `npm run lint` and `npm run build` are the documented automated checks.
- Backend integration tests require a PostgreSQL role that can create disposable databases and are run separately with `--ignored`.
- Feature behavior should be verified against current handlers and repositories when the ledger says `Needs verification`; this baseline does not replace tests.
- The route map is centralized in [`backend/src/routes/mod.rs`](../backend/src/routes/mod.rs) and [`frontend/src/routes/AppRoutes.jsx`](../frontend/src/routes/AppRoutes.jsx). A new feature is incomplete until both sides are intentionally wired or explicitly documented as backend-only/frontend-only.

## Ledger History

- 2026-08-13: Initial code-confirmed inventory created from the route tree, frontend route tree, models, access helpers, migrations, README, and installation guide.
