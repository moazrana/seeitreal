# AR Restaurant Menu — SaaS

Self-serve SaaS that lets restaurants show dishes and deals in AR. Diners scan a QR code and view
a dish in AR right in their mobile browser — no app install. See `AR-Menu-SaaS-Development-Spec.md`
for the full product/security spec; it is the source of truth for this build.

## Repo layout

npm workspaces monorepo:

- `backend/` — NestJS REST API (TypeScript), MySQL via Prisma.
- `frontend/` — React + Vite dashboard for restaurant owners (and later, admin).
- `shared/` — TypeScript types/enums shared by backend and frontend.

## Prerequisites

- Node.js 20+
- Docker (for local MySQL) — or your own MySQL 8 instance

## Setup

```bash
npm install                     # installs all workspaces; also builds shared/ (postinstall)
cp backend/.env.example backend/.env
```

Fill in `backend/.env`. At minimum for local dev:

- `DATABASE_URL` — matches `docker-compose.yml`'s default MySQL credentials, or your own instance.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — generate with `openssl rand -base64 64`.
- `IP_HASH_SALT` — generate with `openssl rand -hex 32`.
- `CORS_ALLOWED_ORIGINS` — e.g. `http://localhost:4173` for the Vite dev server.
- `API_BASE_URL` — must match whatever port the API actually runs on (used to build upload/QR/AR
  URLs) — a mismatch here means generated links point at the wrong place.

Uploads and 3D models (optional until you touch those features):

- `STORAGE_DRIVER` — `local` (default; writes under `backend/var/uploads`, served via
  `GET /api/uploads/...` — fine for dev/self-hosted) or `s3` (R2/S3-compatible; needs the
  `STORAGE_ENDPOINT`/`REGION`/`BUCKET`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`PUBLIC_BASE_URL` vars).
- `TRIPO_API_KEY` — get one at [platform.tripo3d.ai/api-keys](https://platform.tripo3d.ai/api-keys).
  Server-side only; never exposed to the frontend.
- `TRIPO_WEBHOOK_SECRET` — generate with `openssl rand -hex 32`; verifies inbound Tripo callbacks.

The app **refuses to boot** if a required env var is missing or too short — see
`backend/src/config/env.validation.ts`.

Start local MySQL:

```bash
docker compose up -d
```

Run migrations and generate the Prisma client:

```bash
npm run prisma:migrate -w backend   # creates/updates the dev DB schema
```

Create an admin account (self-serve signup only ever creates an "owner" — admin is
provisioned out-of-band by design, never via an HTTP endpoint):

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=... npm run seed:admin -w backend
```

## Running

```bash
npm run start:dev -w backend        # API on http://localhost:4001/api
npm run dev -w frontend             # dashboard on http://localhost:4173
```

Or use the verified agent-driven launcher (brings up MySQL, builds, launches, and smoke-tests
the whole thing in one shot): `backend/.claude/skills/run-backend/smoke.sh`.

## Testing

```bash
npm run test -w backend             # unit tests
npm run test:e2e -w backend         # e2e (needs the DB running + migrated)
```

## Linting / formatting

```bash
npm run lint                        # root: lints backend + shared (frontend has its own oxlint)
npm run format:check
```

## What's implemented so far

**Build order step 1** (spec §9): Auth + Restaurant + Menu CRUD, secured per spec §7 —
argon2 password hashing, rotated refresh tokens (httpOnly cookie), login lockout/backoff,
rate limiting (global + stricter on `/auth/*`), server-side DTO validation, ownership checks
on every restaurant-scoped endpoint (cross-tenant requests get 404), helmet + explicit CORS
allow-list, and a global exception filter that never leaks internals to clients.

**Build order step 2** (spec §9): image upload pipeline + 3D model URL storage + QA/approve flow.

- Uploads (dish photos, restaurant logos) go through the full §7.5 checklist: extension+MIME
  whitelist, real magic-byte verification via image re-decode (not just client-claimed
  type), size/dimension limits, random server-generated filenames, EXIF stripped by
  re-encoding, stored outside the web root with no execute permission.
- Storage is pluggable: `local` disk (dev/self-hosted, served read-only via
  `GET /api/uploads/...`) or `s3` (R2-compatible, for production).
- Tripo integration (spec §11): submit → webhook (shared-secret token, not a documented HMAC
  scheme — see code comments) → poll fallback (`@nestjs/schedule`, catches missed webhooks) →
  downloads the GLB immediately and re-hosts it on our own storage (Tripo's result URL expires
  in ~24h, so it's never stored directly). **Not yet live-verified against a real Tripo
  account** — no API key was available while building this; the wire format is isolated in
  `TripoClientService` and covered by mocked unit tests. Wire in a real key and do one live
  submit+poll before trusting this in production.
- GLB→USDZ conversion (mandatory for iOS AR) is a deliberately **unimplemented stub**
  (`UsdzConversionService`) — see its doc comment for real implementation options. An item can
  reach `qa` status with only a GLB; `AdminService.approve` refuses to publish it without both
  files, so this can't silently ship broken AR.
- Admin QA queue: list items awaiting review, approve (→ `live`, requires both model files),
  reject (→ `pending`, with a note back to the owner) — every action audit-logged
  (`AdminAuditLog`, per spec §10). Admin accounts are seeded out-of-band (`npm run seed:admin`),
  never self-serve.

**Build order step 3** (spec §9): diner-facing AR viewer, public and unauthenticated at
`GET /m/:slug` (reached by `MenuItem.publicSlug`). Server-rendered HTML using Google
`<model-viewer>`, self-hosted from the `@google/model-viewer` npm package (not a third-party
CDN, not a vendored blob in git) via `GET /vendor/model-viewer.min.js`. Renders the real
model + AR button when `ar_status` is `live` with both files present; otherwise shows the
dish photo (or a placeholder) with a "coming soon" notice rather than a broken viewer. All
owner-supplied text (name, description, restaurant name) is HTML-escaped before templating —
verified both by a template-level unit test and an e2e test that posts an actual
`<script>`/`onerror` payload through the real API and checks the served response. The route
carries its own scoped CSP override (`blob:`/`data:`/`wasm-unsafe-eval` for model-viewer's
WebGL + Draco/KTX2 decoding) rather than weakening the API's default CSP. **Two real bugs were
found only by driving this in a real browser, not by curl-based testing** — see the
`run-backend` skill's Gotchas for both (a `Cross-Origin-Resource-Policy` header silently
blocking cross-origin image/model loads, and a missing `wasm-unsafe-eval` CSP directive
silently breaking WASM-dependent model decoding). Analytics (recording `scan`/`ar_launch`
events) is intentionally not wired in yet — that's spec §9 build-order step 5.

**Also built ahead of the strict build order:** a working React dashboard (`frontend/`) —
login/signup, restaurant creation, category management, menu item CRUD, photo upload with
live preview, and the generate-3D-model trigger. Not yet built: the admin-facing UI (QA
queue/approve/reject is API-only for now).

**Not yet built** (see spec §9 for the rest of the build order): QR code generation,
analytics, deals/promos, billing, support/feedback, and the rest of the admin panel (overview
dashboard, restaurant drill-down, support/feedback inboxes).

## API overview

All routes are prefixed `/api`.

| Method           | Path                                            | Auth           | Notes                                           |
| ---------------- | ----------------------------------------------- | -------------- | ----------------------------------------------- |
| POST             | `/auth/signup`                                  | —              | creates an owner account                        |
| POST             | `/auth/login`                                   | —              |                                                 |
| POST             | `/auth/refresh`                                 | refresh cookie | rotates the refresh token                       |
| POST             | `/auth/logout`                                  | refresh cookie |                                                 |
| POST             | `/auth/verify-email`                            | —              |                                                 |
| POST             | `/auth/request-password-reset`                  | —              | always returns a generic response               |
| POST             | `/auth/reset-password`                          | —              | revokes all existing sessions                   |
| POST/GET         | `/restaurants`                                  | JWT            | scoped to the caller; admin sees all            |
| GET/PATCH/DELETE | `/restaurants/:id`                              | JWT            | 404 (not 403) on cross-tenant access            |
| POST             | `/restaurants/:id/logo`                         | JWT            | multipart image upload                          |
| POST/GET         | `/restaurants/:id/categories`                   | JWT            |                                                 |
| PATCH/DELETE     | `/restaurants/:id/categories/:catId`            | JWT            |                                                 |
| POST/GET         | `/restaurants/:id/items`                        | JWT            |                                                 |
| GET/PATCH/DELETE | `/restaurants/:id/items/:itemId`                | JWT            |                                                 |
| POST             | `/restaurants/:id/items/:itemId/photo`          | JWT            | multipart image upload; resets AR status        |
| POST             | `/restaurants/:id/items/:itemId/generate-model` | JWT            | triggers Tripo; only from `pending` status      |
| GET              | `/uploads/:prefix/:filename`                    | —              | read-only static serving (local storage driver) |
| POST             | `/webhooks/tripo?token=...`                     | shared secret  | Tripo task-complete callback                    |
| GET              | `/admin/qa-queue`                               | JWT + admin    |                                                 |
| POST             | `/admin/items/:id/approve`                      | JWT + admin    | requires both GLB and USDZ present              |
| POST             | `/admin/items/:id/reject`                       | JWT + admin    | body: `{ note }`                                |
| GET              | `/m/:slug`                                      | —              | public diner AR viewer page (HTML)              |
| GET              | `/vendor/model-viewer.min.js`                   | —              | self-hosted `<model-viewer>` bundle             |

Full OpenAPI/Swagger docs are not wired up yet — tracked as follow-up work.
