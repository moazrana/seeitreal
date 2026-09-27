# AR Restaurant Menu — SaaS

Self-serve SaaS that lets restaurants show dishes and deals in AR. Diners scan a QR code and view
a dish in AR right in their mobile browser — no app install. See `AR-Menu-SaaS-Development-Spec.md`
for the full product/security spec; it is the source of truth for this build.

## Repo layout

npm workspaces monorepo:

- `backend/` — NestJS REST API (TypeScript), MySQL via Prisma.
- `frontend/` — React + Vite dashboard for restaurant owners.
- `rootApp/` — React + Vite **Root App**, the platform operator's separate admin
  application (`rootApp/ROOT-APP-Implementation-Spec.md`) — its own build, its own hardened
  2FA-only auth, never bundled with `frontend/`.
- `shared/` — TypeScript types/enums shared by backend and both frontends, plus the canonical
  light/dark theme tokens (see [Theming](#theming)).

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
- `IP_HASH_SALT` — generate with `openssl rand -hex 32`. Keys the HMAC used to hash diner IPs for
  scan de-duplication (raw IPs are never stored).
- `TRUST_PROXY` — set `true` when the API runs behind a reverse proxy (nginx). Without it every
  request appears to come from the proxy's IP, which collapses QR-scan counting (all diners look
  like one visitor) and makes per-IP rate limits shared by everyone.
- `CORS_ALLOWED_ORIGINS` — e.g. `http://localhost:4173,http://localhost:4174` for both Vite dev
  servers (`frontend/` and `rootApp/`).
- `API_BASE_URL` — must match whatever port the API actually runs on (used to build upload/QR/AR
  URLs) — a mismatch here means generated links point at the wrong place.

Uploads and 3D models (optional until you touch those features):

- `STORAGE_DRIVER` — `local` (default; writes under `backend/var/uploads`, served via
  `GET /api/uploads/...` — fine for dev/self-hosted) or `s3` (R2/S3-compatible; needs the
  `STORAGE_ENDPOINT`/`REGION`/`BUCKET`/`ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`PUBLIC_BASE_URL` vars).
- `TRIPO_API_KEY` — get one at [platform.tripo3d.ai/api-keys](https://platform.tripo3d.ai/api-keys).
  Server-side only; never exposed to the frontend.
- `TRIPO_WEBHOOK_SECRET` — generate with `openssl rand -hex 32`; verifies inbound Tripo callbacks.
- `TRIPO_TEXTURE_QUALITY` — highest-quality texture option (default `detailed` in code); see
  `documents/3d-model-enhancement.md` §2.
- `AR_ENVIRONMENT_IMAGE_URL` — optional HDR environment-image URL for the diner AR viewer's
  lighting/reflections; defaults to `"neutral"` (model-viewer's built-in studio IBL) when unset.
- `AR_ENVIRONMENT_IMAGE_URL_LIGHT` — optional light-mode counterpart, used when the diner's phone
  is in light mode; defaults to `"neutral"` (never falls back to the dark-mode HDR).

Payments (optional until you touch billing — see `documents/USER-APP-subscription-and-ui.md`):

- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` — USD/international clients. Test-mode key from
  [dashboard.stripe.com/test/apikeys](https://dashboard.stripe.com/test/apikeys); webhook secret
  from `stripe listen` (dev) or a dashboard webhook endpoint (prod). Server-side only.
- `SAFEPAY_API_KEY`, `SAFEPAY_WEBHOOK_SECRET`, `SAFEPAY_BASE_URL` — PKR/Pakistani clients.
  Sandbox credentials from your Safepay merchant dashboard; leave `SAFEPAY_BASE_URL` unset to use
  the sandbox host.
- `DEFAULT_CHECKOUT_COUNTRY` — 2-letter ISO country code, soft default for the checkout form only
  (the billing country the owner confirms is what actually routes Stripe vs Safepay).
- `SUBSCRIPTION_GRACE_PERIOD_DAYS` — days between a failed payment and the AR viewer actually
  gating a restaurant's links (default `5`).
- `FRONTEND_BASE_URL` — the dashboard's own origin, used to build Stripe/Safepay checkout
  success/cancel redirect URLs (distinct from `API_BASE_URL`, the API's own origin).

Root App (required — the API won't boot without these):

- `ROOT_JWT_ACCESS_SECRET`, `ROOT_JWT_REFRESH_SECRET` — generate with `openssl rand -base64 64`.
  Fully separate from `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` above — a leaked customer secret
  must never be able to forge a root-admin session.
- `ROOT_TOTP_ENCRYPTION_KEY` — generate with `openssl rand -hex 32`; encrypts 2FA secrets at rest.
- `ROOT_APP_IP_ALLOWLIST` — comma-separated IPs/CIDRs allowed to reach `/api/root/*`. Leave empty
  for local dev (allows any IP, logs a warning); set before exposing the Root App publicly.

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

Create a Root App admin account the same way (fully separate identity — see
`rootApp/ROOT-APP-Implementation-Spec.md` §2, §5). 2FA enrollment is required on first login,
so no password reset flow exists for it — re-run this to reset an account back into enrollment:

```bash
ROOT_ADMIN_EMAIL=root@example.com ROOT_ADMIN_PASSWORD=... ROOT_ADMIN_ROLE=superadmin \
  npm run seed:root-admin -w backend
```

## Running

```bash
npm run start:dev -w backend        # API on http://localhost:4001/api
npm run dev -w frontend             # dashboard on http://localhost:4173
npm run dev -w rootApp              # Root App on http://localhost:4174
```

Or use the verified agent-driven launcher (brings up MySQL, builds, launches, and smoke-tests
the whole thing in one shot): `backend/.claude/skills/run-backend/smoke.sh`.

## Testing

```bash
npm run test -w backend             # unit tests
npm run test:e2e -w backend         # e2e (needs the DB running + migrated)
npm run test -w shared              # theme token contract + WCAG AA contrast checks
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
  type), size/dimension limits (8 MB, 4096 px, plus a decoded-pixel cap against
  decompression bombs), random server-generated filenames, EXIF stripped by re-encoding, stored
  outside the web root with no execute permission.
- Image optimization before Tripo (`documents/TASK-image-optimization.md`): the dashboard
  pre-compresses each dish photo in the browser (canvas, no extra dependency) to a 2048 px JPEG so
  multi-MB phone photos don't cross slow mobile networks; it falls back to the original file
  if the browser can't decode it. The server then re-normalizes every file authoritatively,
  per purpose (`IMAGE_OUTPUT_PROFILES`): dish photos are EXIF auto-rotated, resized to a
  2048 px longest edge (never enlarged), flattened onto white and re-encoded as metadata-free
  JPEG q82. That stored copy is the source of truth and is what Tripo receives. Logos stay
  WebP (transparency preserved), capped at 1024 px. The 2048 px/q82 target lives in
  `shared/src/menu.ts`; guardrail tests keep it at or above 1024 px / q80.
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
  reach `qa` status with only a GLB; the Root App's `RootQaService.approve` refuses to publish
  it without both files, so this can't silently ship broken AR.
- Model QA (approve/reject) **moved to the Root App** — see below. The old `backend/src/admin/`
  module, its `/api/admin/*` routes, and the customer dashboard's QA queue page are gone.
- Real-world AR sizing (`documents/TASK-real-world-ar-sizing.md`): `MenuItem` carries optional
  `width_mm`/`height_mm`/`length_mm`, entered by the owner in **inches** (dashboard, up to 20"),
  stored as whole millimetres and validated server-side (`10–508`, bounds in
  `shared/src/menu.ts`). Tripo returns models at an arbitrary normalized scale, so before
  GLB→USDZ conversion `ModelScalingService` uniform-scales the downloaded GLB so its
  **footprint** (the larger of its X/Z bounding-box extents) matches the larger of the item's
  width/length. Tripo doesn't orient dishes consistently, so matching X to width alone made
  models whose long side landed on Z far too large. With no dimensions entered, the footprint
  defaults to 10" (`DEFAULT_FOOTPRINT_MM`, a typical plate), never Tripo's arbitrary scale.
  Scaling is uniform (no per-axis stretching) and grounds the model at `y = 0`. The diner viewer
  shows a "true size" caption (inches, plus cm) when dimensions are set.
- Model optimization (`ModelOptimizationService`), after scaling and before USDZ conversion, and
  for manual GLB uploads (after validation): dedup, weld, then meshoptimizer simplification to
  ~150k triangles, then textures capped at 2048 px in their original format (no extensions, so
  Scene Viewer, Quick Look and `<model-viewer>` need no extra decoders). On real Tripo output this
  took 1.42M → 150k triangles and 41 MB → 4.9 MB with dimensions unchanged. It's a performance
  step, not a gate: on failure the original model is kept and the error logged.
- USDZ converter texture binding (`tools/usdz/gltf_to_usdz.py`): material texture references
  are resolved through `textures[i].source`. They were previously used as image indices, which
  bound Tripo models' normal map into the metallic slot and rendered every dish as chrome in iOS
  AR Quick Look. Models converted before this fix need regenerating (or re-converting).

**3D model realism enhancement** (`documents/3d-model-enhancement.md`) — extends spec §11:

- Multi-photo upload: an item accepts **1–5 photos** (`MenuItemPhoto`, ordered), each validated
  independently through the same §7.5 pipeline as a single photo. The first photo is always the
  item's display photo. `POST/DELETE .../items/:itemSlug/photos[/:photoId]` replaced the old
  single-photo `.../photo` endpoint.
- Generation routing: 1 photo uses Tripo's single image-to-3D endpoint; 2–5 photos use its
  **multiview** endpoint (capped at 4 images, in upload order — Tripo's documented multiview
  max), reconstructing the model from real angles instead of hallucinating unseen sides. Runs
  with `texture`/`pbr` on and the highest texture quality (`TRIPO_TEXTURE_QUALITY`, default
  `detailed`) — see `TripoGenerationService`/`TripoClientService`. The multiview wire format is
  **not yet live-verified**, same caveat as the single-image endpoint below.
- The diner AR viewer's `<model-viewer>` now ships `environment-image` (HDR lighting, defaults to
  `"neutral"`, configurable via `AR_ENVIRONMENT_IMAGE_URL`), `exposure`, `tone-mapping`, and
  `shadow-softness` alongside the existing contact shadow, so models render grounded and lit
  instead of flat/floating.
- A photo-capture guide (bright even lighting, plain background, multiple angles) is shown to
  owners at the upload step (`PhotoCaptureGuide` in the frontend).
- Hero-dish bypass: `POST .../items/:itemSlug/model` lets an owner upload an already-produced `.glb`
  (Polycam/photogrammetry/a 3D artist) instead of generating one via Tripo. Validated the same
  way as an image upload (whitelist + real binary-header verification via `GlbUploadService`,
  size-limited, server-generated filename), converted to USDZ, and routed into the normal
  QA → live flow. Deliberately skips `ModelScalingService` — see `ManualModelUploadService`'s doc
  comment for why.

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

**Root App** (`rootApp/`, `rootApp/ROOT-APP-Implementation-Spec.md` — replaces the main spec's
§10 admin panel; **Phase A / foundation scope**, see the spec doc's own §5 for what's deferred):

- **Separate app, separate everything.** Own Vite build (`npm run dev -w rootApp`, port 4174),
  own backend module (`backend/src/root/`, every route under `/api/root/*`), own admin identity
  (`RootAdminUser` — not `User`/`UserRole.admin`), own JWT secrets, own refresh-token cookie
  (`ar_root_refresh_token`, scoped to `/api/root/auth`) — a leaked customer session can never
  touch it and vice versa.
- **Mandatory TOTP 2FA**, enforced server-side: first login always walks through QR-code
  enrollment (`otplib`, secret encrypted at rest with AES-256-GCM) before a session is issued;
  every login after requires a 6-digit code or a single-use backup code. Accounts are seeded
  out-of-band (`npm run seed:root-admin`), never self-serve — see Setup above.
- **RBAC**: `superadmin` vs `support` (`RootAdminRole`). Both can view the dashboard, restaurant
  list/detail, and the QA queue; only `superadmin` can suspend/reactivate a restaurant or
  hide/unhide an item.
- **Full audit log** (`RootAuditLog`) — every login attempt (success/failure), 2FA event, and
  destructive action records who/what/when/from-which-IP (real IP, not hashed — this is a
  security log, not diner analytics).
- **App-level IP allowlist** (`IpAllowlistGuard`, `ROOT_APP_IP_ALLOWLIST`) — works standalone
  today; an edge-level allowlist (nginx, since that's what the real server runs — the spec's own
  Caddy example doesn't apply here) is a deliberately separate, later deployment step, not done
  in this pass.
- **Restaurant control**: suspend blocks the owner's dashboard/API (403, distinct from the
  existing cross-tenant 404) _and_ takes every public page for that restaurant offline (404).
  **Item control**: hiding an item only pulls its public AR page — the owner keeps full edit
  access.
- **Dashboard**: real counts (restaurants, items by AR status, QA queue size, open tickets,
  unreviewed feedback, active subscriptions by plan) — no fabricated numbers. MRR shows "not
  configured yet" rather than a dollar figure, since plan pricing doesn't exist yet.
- **Explicitly deferred** (need real business decisions first, not just more code): PKR/USD
  plan pricing, promo codes, billing/collections (no payment gateway is wired in anywhere),
  and support/feedback inboxes (the owner-side submission endpoints don't exist yet either).

**Also built ahead of the strict build order:** a working React dashboard (`frontend/`) —
login/signup, a **multi-restaurant dashboard** (an owner can run up to
`MAX_RESTAURANTS_PER_OWNER` restaurants; `GET /api/dashboard/overview` aggregates each
restaurant's dish counts by AR status, QR scans and most-scanned dishes, scoped server-side to
the caller), **cuisine types** (the owner-facing name for menu categories; the API/DB keep
`category`) with cuisine tabs that filter the dish grid, menu item CRUD,
multi-photo upload (up to 5, with a capture guide and per-photo removal), a manual-GLB upload for
hero dishes, and the generate-3D-model trigger. Also:

- **Duplicates rejected:** a cuisine type name is unique per restaurant (DB unique index,
  case-insensitive via the column collation; the migration merged pre-existing duplicates and
  re-pointed their dishes), and so is a dish name (application check with a 409 — existing
  duplicate dishes each have their own printed QR, so they aren't merged). Names are trimmed.
  The dashboard shows an animated warning dialog on a duplicate and a success dialog when a dish
  is added (CSS-only animation, disabled under `prefers-reduced-motion`).
- **QR scan analytics:** every served dish page (what a QR code opens) records an
  `AnalyticsEvent`. The IP is stored only as an HMAC-SHA256 keyed with `IP_HASH_SALT`, and repeat
  opens by the same visitor within 30 minutes count once. Not-found, hidden and
  subscription-gated pages are never counted. Scan counts show per dish and on the dashboard.
  Requires `TRUST_PROXY=true` behind nginx (see env vars).
- **Live updates, no reload:** `useLiveRefresh` re-polls the page's existing authenticated
  endpoints while the tab is visible (every 5 s while a dish is generating or in QA, 20 s
  otherwise; billing every 15 s), refreshes on focus, stops while hidden, and backs off for 60 s
  on `429`. It uses polling rather than a push channel so every refresh passes the same JWT and
  ownership checks and works across multiple API instances.
- **QR codes persist:** `MenuItem.qr_issued_at` is set the first time a dish is approved and
  never cleared (live dishes were backfilled by migration). The "Show QR code" button stays
  available from then on, even while the model is regenerated, and the viewer shows diners a
  "coming soon" note. Removing a photo no longer resets a dish's model, so it no longer takes the
  dish offline. QR codes carry a small "Powered by seeItReal.com" line and logo.
- **Confirm before destructive actions:** deleting a cuisine type, dish or photo, or cancelling
  a subscription, opens an accessible confirm dialog (native `<dialog>`, focus starts on Cancel).
- **Billing:** the billing page shows the current plan and invoices only; packages live on
  `/restaurants/:slug/billing/plans`, reached from "Change package" / "Choose a package".

**Not yet built** (see spec §9 for the rest of the build order, and the Root App bullets above
for what it specifically defers): QR code generation, analytics, deals/promos, billing,
support/feedback.

## Theming

Light and dark mode per `documents/USER-APP-theming.md`:

- **One source of truth:** `shared/src/theme.ts` defines the semantic role tokens (`--bg`,
  `--surface`, `--text`, `--text-muted`, `--border`, `--accent-strong`, …) for both themes, plus
  the per-theme Three.js hero and `<model-viewer>` parameters. `npm run build -w shared` also
  generates `dist/theme.css` and `dist/theme-init.js` from it. Components use `var(--token)` only
  — never a raw colour; add or change a colour in `theme.ts`.
- **Dashboard / landing / auth:** default to the system preference; the System / Light / Dark
  toggle (landing nav + dashboard header) stores an explicit choice in `localStorage`
  (`seeitreal.theme`) and sets `data-theme` on `<html>`. A blocking same-origin
  `/theme-init.js` (served/emitted by a small plugin in `frontend/vite.config.ts`) applies it
  before first paint — no flash, and no inline script, so no `'unsafe-inline'` is ever needed in
  a CSP.
- **Diner AR viewer / not-found / expired pages:** no toggle; they follow the diner's
  `prefers-color-scheme` in pure CSS. `/api/static/ar-viewer-theme.js` (same-origin, so the
  viewer CSP stays `script-src 'self'`) swaps `<model-viewer>`'s `exposure` and
  `environment-image` for the active theme.
- **Hero 3D** (`documents/TASK-hero-3d-fix.md`): a solid faceted gem with a wireframe overlay and
  point cloud, lit by three brand-colour point lights. Per-theme material and light values live in
  `heroSceneTheme`. They're the task's reference values; `Scene.tsx` scales them by π with
  distance decay off, to match on three's physically based lights (r155+). The camera distance is
  computed from the viewport's aspect ratio so the gem never fills more than 60% of the shorter
  axis, and a radial `--hero-scrim` keeps the headline legible.
- **Contrast:** `npm run test -w shared` asserts WCAG AA for text on every surface in both
  themes. (The spec's light `--text-faint` was nudged from `#868ca0` to `#7f859a` to clear 3:1
  on `--surface-2`.)

## API overview

All routes are prefixed `/api`.

Customer routes address a restaurant by `Restaurant.slug` and an item by `MenuItem.publicSlug`,
never by numeric id. The slug is resolved server-side (`RestaurantIdFromSlug`/`ItemIdFromSlug`),
and ownership is still enforced in the service layer. Categories and photos keep numeric ids;
they only appear in API requests, never in a browser URL.

| Method           | Path                                                 | Auth           | Notes                                                                                                  |
| ---------------- | ---------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------ |
| POST             | `/auth/signup`                                       | —              | creates an owner account                                                                               |
| POST             | `/auth/login`                                        | —              |                                                                                                        |
| POST             | `/auth/refresh`                                      | refresh cookie | rotates the refresh token                                                                              |
| POST             | `/auth/logout`                                       | refresh cookie |                                                                                                        |
| POST             | `/auth/verify-email`                                 | —              |                                                                                                        |
| POST             | `/auth/request-password-reset`                       | —              | always returns a generic response                                                                      |
| POST             | `/auth/reset-password`                               | —              | revokes all existing sessions                                                                          |
| POST/GET         | `/restaurants`                                       | JWT            | scoped to the caller; admin sees all; owners capped at `MAX_RESTAURANTS_PER_OWNER` (409)               |
| GET              | `/dashboard/overview`                                | JWT            | the caller's restaurants with dish/AR-status counts, QR scans, top dishes                              |
| GET              | `/restaurants/:slug/analytics/items`                 | JWT            | QR scan count per dish; 404 on cross-tenant access                                                     |
| GET/PATCH/DELETE | `/restaurants/:slug`                                 | JWT            | 404 on cross-tenant access; 403 if the restaurant is suspended                                         |
| POST             | `/restaurants/:slug/logo`                            | JWT            | multipart image upload                                                                                 |
| POST/GET         | `/restaurants/:slug/categories`                      | JWT            |                                                                                                        |
| PATCH/DELETE     | `/restaurants/:slug/categories/:catId`               | JWT            |                                                                                                        |
| POST/GET         | `/restaurants/:slug/items`                           | JWT            |                                                                                                        |
| GET/PATCH/DELETE | `/restaurants/:slug/items/:itemSlug`                 | JWT            |                                                                                                        |
| POST             | `/restaurants/:slug/items/:itemSlug/photos`          | JWT            | multipart, 1–5 files (field `files`); resets AR status; 400 past 5 total                               |
| DELETE           | `/restaurants/:slug/items/:itemSlug/photos/:photoId` | JWT            | 404 if the photo isn't this item's; leaves the 3D model/AR status untouched                            |
| POST             | `/restaurants/:slug/items/:itemSlug/generate-model`  | JWT            | triggers Tripo (single-image or multiview by photo count); only from `pending`; dimensions optional    |
| POST             | `/restaurants/:slug/items/:itemSlug/model`           | JWT            | hero-dish bypass: multipart `.glb` upload, skips Tripo; validated, then optimized; only from `pending` |
| GET              | `/uploads/:prefix/:filename`                         | —              | read-only static serving (local storage driver)                                                        |
| POST             | `/webhooks/tripo?token=...`                          | shared secret  | Tripo task-complete callback                                                                           |
| GET              | `/m/:slug`                                           | —              | public diner AR viewer page (HTML); 404 if suspended/hidden                                            |
| GET              | `/vendor/model-viewer.min.js`                        | —              | self-hosted `<model-viewer>` bundle                                                                    |

**Root App** — every route below is also IP-allowlist-gated (`ROOT_APP_IP_ALLOWLIST`) on top of
its listed auth, and fully separate from the customer JWT above (`root-jwt` Passport strategy,
`RootAdminUser` identity).

| Method | Path                                           | Auth                    | Notes                                                      |
| ------ | ---------------------------------------------- | ----------------------- | ---------------------------------------------------------- |
| POST   | `/root/auth/login`                             | IP allowlist            | email+password → a 2FA challenge, never a session directly |
| POST   | `/root/auth/totp/verify-setup`                 | IP allowlist            | first login only; activates 2FA, returns backup codes      |
| POST   | `/root/auth/totp/verify`                       | IP allowlist            | TOTP code or backup code → session                         |
| POST   | `/root/auth/refresh`                           | `ar_root_refresh_token` | rotates the refresh token                                  |
| POST   | `/root/auth/logout`                            | `ar_root_refresh_token` |                                                            |
| GET    | `/root/dashboard`                              | root JWT                | any role                                                   |
| GET    | `/root/restaurants`                            | root JWT                | `?q=` search, `?status=active\|suspended`; any role        |
| GET    | `/root/restaurants/:slug`                      | root JWT                | any role                                                   |
| POST   | `/root/restaurants/:slug/suspend`              | root JWT + `superadmin` | body: `{ reason }`                                         |
| POST   | `/root/restaurants/:slug/reactivate`           | root JWT + `superadmin` |                                                            |
| POST   | `/root/restaurants/:slug/items/:itemId/hide`   | root JWT + `superadmin` |                                                            |
| POST   | `/root/restaurants/:slug/items/:itemId/unhide` | root JWT + `superadmin` |                                                            |
| GET    | `/root/qa-queue`                               | root JWT                | any role                                                   |
| POST   | `/root/items/:id/approve`                      | root JWT                | requires both GLB and USDZ present (dimensions optional)   |
| POST   | `/root/items/:id/reject`                       | root JWT                | body: `{ note }`                                           |

Full OpenAPI/Swagger docs are not wired up yet — tracked as follow-up work.
