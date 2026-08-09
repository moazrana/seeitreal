# AR Restaurant Menu — SaaS Development Specification

**Purpose of this document:** This is a build specification for an AI coding agent (or developer). Follow it top to bottom. Every requirement in the **Security Requirements** section is **mandatory** and must not be skipped, weakened, or deferred. When a choice is left open, pick the option that is most secure and follows established best practices.

---

## 1. Product Overview

We are building a **self-serve SaaS** that lets restaurants show their dishes and deals in **augmented reality (AR)**.

- A **restaurant owner** signs up, adds menu items (name, price, description, photo), and the system produces a **3D model** for each dish and a **QR code** to reach it.
- A **diner** scans a QR code with their phone camera and views the dish **in AR in their own space** — directly in the mobile browser, **with no app install**.
- The platform supports **individual items** and **deals/promos**, generates **per-item QR codes** and a **whole-menu QR code**, and tracks **analytics** (scans, AR views per item).

The diner-facing AR experience **must** be web-based (WebAR). Never require the diner to install anything.

---

## 2. Users & Roles

| Role | Description | Access |
|------|-------------|--------|
| **Diner** | End customer scanning a QR. No account. | Public read-only AR/menu pages |
| **Restaurant Owner** | Manages their own restaurant, menu, deals, QR codes, analytics, billing. | Authenticated; scoped to **their own** restaurant only |
| **Platform Admin** | Operator of the SaaS. Manages restaurants, plans, model production/QA, global analytics. | Authenticated; elevated privileges |

**Hard rule:** A restaurant owner must **never** be able to read or modify another restaurant's data. Enforce ownership checks on every request (see Security §7.3).

---

## 3. Technology Stack

Build **API-first** so the same backend serves the web dashboard now and a mobile app (React Native) later.

- **Backend:** NestJS (TypeScript), REST API.
- **Database:** MySQL, accessed **only** through an ORM/query builder with **parameterized queries** (Prisma or TypeORM). Use **migrations** — never edit schema by hand in production.
- **Frontend (dashboard):** React + Vite (TypeScript).
- **Diner AR viewer:** A lightweight standalone web page using Google `<model-viewer>`. Serves `.glb` (Android/Scene Viewer) and `.usdz` (iOS/Quick Look) per dish.
- **File/model storage:** Object storage (e.g. S3-compatible) or a dedicated non-executable storage path served via CDN. **Never** serve uploaded files from a path where they could be executed.
- **3D model pipeline:** Dish photo → AI 3D generation API (e.g. Meshy / Tripo) → **human QA step** → publish. Model URLs are stored on the menu item record.
- **Auth:** JWT access tokens + refresh tokens; passwords hashed with **argon2** (or bcrypt).
- **Payments:** Stripe (or local gateway) via webhooks. Never trust client-side payment state.

---

## 4. Core Modules / Features

1. **Auth & Accounts** — signup, login, logout, email verification, password reset, refresh tokens.
2. **Restaurant Management** — create/edit restaurant profile (name, logo, slug, contact).
3. **Menu & Items** — CRUD for categories and menu items (name, price, description, photo, 3D model URLs, status).
4. **3D Model Pipeline** — upload dish photo → trigger generation → QA/approve → mark item AR-ready. Tripo API integration and GLB/USDZ handling detailed in §11.
5. **Deals / Promos** — create time-bound deals (start/end date, items included, promo pricing), each with its own AR view + QR.
6. **QR Codes** — generate a QR per item, per deal, and one per full menu. Each QR encodes a unique public URL.
7. **Diner AR Viewer (public)** — mobile web page that loads the item/menu and launches AR.
8. **Analytics** — record scans and AR launches per item/deal; owner dashboard shows counts.
9. **Billing & Subscriptions** — tiered monthly subscription + one-time per-item setup fee + on-demand deal campaign charges.
10. **Admin Panel & Operations Dashboard** — platform-wide dashboard for the operator: restaurant/item/revenue overview, model QA queue, support inbox, and feedback inbox. Full detail in §10.
11. **Support / Problem Tracking** — restaurant owners raise problems from their dashboard; admin views, replies to, and resolves them (ticket system with a message thread).
12. **Feedback** — restaurant owners submit feedback/suggestions/ratings; admin reviews them in one place.

---

## 5. Data Model (core entities)

Keep this minimal for the MVP; expand later.

- **User** — `id`, `email` (unique), `password_hash`, `role`, `email_verified`, timestamps.
- **Restaurant** — `id`, `owner_user_id` (FK → User), `name`, `slug` (unique), `logo_url`, `plan_id`, timestamps.
- **MenuCategory** — `id`, `restaurant_id` (FK), `name`, `sort_order`.
- **MenuItem** — `id`, `restaurant_id` (FK), `category_id` (FK), `name`, `description`, `price`, `photo_url`, `model_glb_url`, `model_usdz_url`, `ar_status` (`pending` | `generating` | `qa` | `live`), `public_slug` (unique), timestamps.
- **Deal** — `id`, `restaurant_id` (FK), `title`, `description`, `promo_price`, `starts_at`, `ends_at`, `public_slug`, `status`.
- **DealItem** — join table linking `Deal` ↔ `MenuItem`.
- **QrCode** — `id`, `restaurant_id`, `target_type` (`item` | `deal` | `menu`), `target_id`, `public_url`, `image_url`.
- **AnalyticsEvent** — `id`, `restaurant_id`, `target_type`, `target_id`, `event_type` (`scan` | `ar_launch`), `created_at`, `ip_hash` (hashed, not raw IP).
- **Subscription** — `id`, `restaurant_id`, `plan`, `status`, `current_period_end`, gateway references.
- **Invoice / Charge** — `id`, `restaurant_id`, `type` (`subscription` | `item_setup` | `deal_campaign`), `amount`, `status`, timestamps.
- **SupportTicket** — `id`, `restaurant_id` (FK), `created_by_user_id` (FK), `subject`, `status` (`open` | `in_progress` | `resolved` | `closed`), `priority` (`low` | `normal` | `high`), `created_at`, `updated_at`.
- **TicketMessage** — `id`, `ticket_id` (FK), `sender_user_id` (FK), `sender_role` (`owner` | `admin`), `body`, `created_at`. (This is the reply thread on a ticket.)
- **Feedback** — `id`, `restaurant_id` (FK), `created_by_user_id` (FK), `type` (`suggestion` | `complaint` | `praise`), `rating` (nullable, 1–5), `message`, `status` (`new` | `reviewed`), `created_at`.

**Rules:** every table has an integer/UUID primary key and `created_at` / `updated_at`. All foreign keys enforced at the DB level. Money stored as integer minor units (e.g. paisa/cents) or `DECIMAL`, **never** as float.

---

## 6. Billing Logic

- **Subscription** — recurring monthly, tiered by menu size (e.g. Starter / Growth / Pro). This is the predictable recurring revenue and must **not** decrease when items are added.
- **Item setup fee** — one-time charge **per item**, applied when a new dish model + QR is produced (month 1 covers the initial batch; later additions are charged again at creation time). Not recurring.
- **Deal campaign** — separate on-demand charge for running a promo for a fixed period.

All charges must be recorded as `Invoice/Charge` rows. Payment confirmation comes from the **gateway webhook**, verified by signature — never from a client request.

---

## 7. SECURITY REQUIREMENTS (MANDATORY)

Every item below is a hard requirement. The build is not complete until all are satisfied.

### 7.1 Secrets & Configuration
- **No secret, key, password, or token may be hardcoded** anywhere in the codebase. All of them live in environment variables loaded from a `.env` file.
- `.env` **must** be listed in `.gitignore` and never committed. Provide a `.env.example` with keys but **no real values**.
- Validate required env vars at startup (e.g. with a config schema); the app should **refuse to boot** if a required secret is missing.
- Use **separate** secrets/credentials for development, staging, and production.
- Database credentials, JWT signing secret, payment keys, storage keys, and 3D-API keys are all secrets — treat every one this way.

### 7.2 SQL Injection & Input Validation
- **All** database access goes through the ORM/query builder using **parameterized/prepared statements**. Never build SQL by string-concatenating user input. If raw SQL is ever unavoidable, it **must** use bound parameters.
- **Validate and whitelist every input** on the server using DTOs + `class-validator` (type, length, format, allowed range/enum). Reject anything that doesn't match — do not "clean and continue" silently.
- Never trust client-side validation; the frontend checks are UX only, the server is the source of truth.
- Enforce strict types (numbers are numbers, emails match an email rule, slugs match `^[a-z0-9-]+$`, etc.).
- Escape/encode all output rendered into HTML to prevent **XSS**. Set a Content-Security-Policy.

### 7.3 Authentication & Authorization
- Passwords hashed with **argon2** (or bcrypt) with a strong work factor. Never store or log plaintext passwords.
- Use JWT access tokens (short-lived) + refresh tokens (rotated). Sign with a secret from `.env`.
- **Authorization on every protected endpoint:** verify the authenticated user's role **and** that the requested resource belongs to them (ownership check). A restaurant owner requesting another restaurant's item must get `403`/`404`, never the data.
- Enforce strong password rules and lockout/backoff on repeated failed logins.

### 7.4 Rate Limiting (no rapid/consecutive requests)
- Apply global rate limiting/throttling (e.g. `@nestjs/throttler`) on **all** endpoints.
- Apply **stricter** limits on sensitive endpoints: login, signup, password reset, and the public scan/AR endpoints (to stop scraping/abuse).
- Limit by **IP and by authenticated user**. Return `429 Too Many Requests` when exceeded.
- Debounce/guard actions that trigger paid or expensive work (e.g. 3D model generation) so a user cannot fire them repeatedly in quick succession.

### 7.5 File Upload Security (block scripts / malicious files)
Uploads are **image-only** (dish photos, logos). Enforce **all** of the following:
- **Whitelist** allowed types by both **extension** and **MIME type** (`image/jpeg`, `image/png`, `image/webp` only). Reject everything else, including `.svg` (can carry scripts), `.html`, `.php`, `.js`, executables, and archives.
- **Verify the file's real content** by checking magic bytes / re-decoding it as an image — do **not** trust the client-supplied filename or MIME header.
- Enforce a **maximum file size** and image dimension limits.
- **Rename every uploaded file** to a server-generated random name; never use the user-supplied filename. Strip EXIF/metadata.
- Store uploads in **object storage or a non-executable directory outside the web root**. The storage path must have **no execute permission**; files are served as static assets/attachments via CDN, never executed.
- Optionally run an antivirus/malware scan on uploads before they go live.
- Reject any request whose content type or payload doesn't match the expected image upload.

### 7.6 Transport, Headers & CORS
- Serve **everything over HTTPS/TLS**. Redirect HTTP → HTTPS.
- Add security headers via `helmet` (HSTS, X-Content-Type-Options, X-Frame-Options/frame-ancestors, CSP).
- Configure **CORS** with an explicit allow-list of origins — never `*` on authenticated endpoints.
- Use `SameSite`, `Secure`, `HttpOnly` cookies where cookies are used.

### 7.7 Error Handling, Logging & Data Protection
- Never return stack traces, SQL errors, or internal details to the client. Return generic, safe error messages; log the details server-side.
- Log auth events, rate-limit hits, and upload rejections. **Never log secrets, passwords, tokens, or full raw payment data.**
- Store only hashed IPs in analytics (privacy).
- Apply **least privilege** to the DB user the app connects with (no `DROP`/`GRANT` in production).
- Keep dependencies updated; run automated vulnerability scans (`npm audit` / equivalent) in CI.

---

## 8. Coding Best Practices (required)

- **Clean, modular architecture** — separate concerns (controllers → services → repositories). No business logic in controllers.
- **TypeScript strict mode** on; no `any` unless justified.
- **Consistent style** — enforce ESLint + Prettier; CI fails on lint errors.
- **DTOs + validation** for every request/response boundary.
- **Environment-based config** — no environment-specific values in code.
- **Database migrations** for every schema change; never manual edits in production.
- **Tests** — unit tests for services, integration tests for critical flows (auth, billing, uploads), and at least happy-path e2e for signup → add item → generate model → view AR.
- **Meaningful names**, small functions, no dead code, no commented-out blocks left in.
- **Error handling** — no silent catches; handle or propagate.
- **Git hygiene** — small commits, PR review, protected main branch, secrets never committed.
- **Documentation** — a `README` covering setup, env vars (referencing `.env.example`), and how to run/migrate/test. Document the API (e.g. Swagger/OpenAPI).

---

## 9. Build Order (MVP first)

Build in this sequence so value is provable early:

1. **Auth + Restaurant + Menu CRUD** (secure from day one — §7 applies immediately).
2. **Image upload pipeline** (with all §7.5 protections) + 3D model URL storage + QA/approve flow.
3. **Diner AR viewer page** (`model-viewer`, glb + usdz) reachable by a public slug.
4. **QR generation** — per item, per menu.
5. **Analytics** — record and display scans / AR launches.
6. **Deals/promos** + their QR + AR view.
7. **Billing** — subscription tiers + item setup fee + deal charges via gateway webhooks.
8. **Support & Feedback** — ticket system (owner raises, admin resolves) + feedback submission.
9. **Admin Panel & Operations Dashboard** — overview metrics, restaurant drill-down, QA queue, support inbox, feedback inbox (see §10).

Ship 1–3 as the first testable slice (a restaurant can add a dish and a diner can see it in AR).

---

## 10. Admin Panel & Operations Dashboard (detailed)

This is the operator's control center — **admin role only**. Every endpoint here requires the `admin` role and is subject to all §7 security rules. Log every admin action (who did what, when) to an audit trail.

### 10.1 Overview Dashboard (landing screen)
At-a-glance operational health, each figure clickable to drill in:
- **Restaurants:** total signed up, new this week/month, active vs inactive.
- **Items:** total uploaded across the platform, breakdown by AR status (`pending` / `generating` / `qa` / `live`).
- **Model QA queue count** — how many items are waiting for your approval right now.
- **Support:** number of **open** tickets, and how many are high priority.
- **Feedback:** count of **new** (unreviewed) feedback entries.
- **Revenue:** active subscriptions by plan and monthly recurring revenue (MRR).
- **Recent activity feed** — latest signups, uploads, tickets, and feedback.

### 10.2 Restaurants
- A searchable, filterable **list of all restaurants**: name, plan, signup date, status, item count, open-ticket count.
- **Drill into one restaurant** to see everything about it in one place: profile, plan/subscription, **all their uploaded items** (with AR status and photos), their deals, billing/invoices, analytics, and their tickets + feedback history.
- Admin actions: change plan, suspend/reactivate, or contact the owner.

### 10.3 Model QA Queue
- List of items in `qa` status with the submitted photo and the generated 3D model.
- **Approve** (sets item to `live`) or **reject** (sends back with a note to the owner).

### 10.4 Support Inbox
- All tickets across all restaurants, filterable by status and priority, sortable by newest/oldest.
- Open a ticket to see the **full message thread**; reply, change status (`open` → `in_progress` → `resolved` → `closed`), and set priority.
- The restaurant owner sees your replies and status changes on their own dashboard.

### 10.5 Feedback Inbox
- All feedback entries with restaurant, type, optional rating, and message.
- Filter by type/rating; mark entries as **reviewed** so you can triage what's new.

### 10.6 Restaurant-owner side (so the admin has something to see)
For the above to work, the owner's dashboard must include:
- A **"Report a problem / Get help"** form that creates a `SupportTicket`, plus a view of their tickets and replies.
- A **"Give feedback"** form (suggestion / complaint / praise, optional 1–5 rating) that creates a `Feedback` record.

---

## 11. 3D Model Pipeline — Tripo API Integration & GLB/USDZ Handling

The AI 3D generation (Tripo) runs as a **server-side, asynchronous** pipeline. Follow this exactly.

### 11.1 The async flow
Tripo is a standard async REST API — you do not get the model back in the same request.
1. **Submit** — the backend sends a `POST` to the image-to-3D endpoint with the dish image (public URL or base64) plus options (`texture: true`, `pbr: true`). Tripo returns a `task_id` immediately.
2. **Wait for completion** — use Tripo's **webhook / `callback_url`** so Tripo notifies your server once when the model is ready (preferred). Keep **status polling** with the `task_id` as a fallback in case a webhook is missed.
3. **Receive result** — when the task status is `FINISHED`, the response contains the model output (see 11.2).

### 11.2 What Tripo returns (the output)
The finished result is JSON containing:
- `model_mesh.url` — a **`.glb`** file (the 3D mesh with textures/PBR baked in), a few MB.
- `rendered_image.url` — a small preview thumbnail (use it as the item's preview image).

`GLB` is the primary output format. There is **no USDZ** in the response — that has to be produced (see 11.3).

### 11.3 GLB → USDZ conversion (MANDATORY for iOS)
`<model-viewer>` needs **two** files to cover all phones:
- **`.glb`** → Android (Scene Viewer). This is what Tripo gives you directly.
- **`.usdz`** → iOS (AR Quick Look). Tripo does **not** produce this, so the backend must **convert the GLB to USDZ** after download (e.g. Apple's `usdzconvert` / Reality Converter, or an equivalent library in the pipeline).

Store **both** files and save both URLs on the `MenuItem` (`model_glb_url`, `model_usdz_url`). An item is not AR-ready until both exist.

### 11.4 Critical rules
- **The Tripo result URL expires after ~24 hours.** The backend must **download the GLB immediately and re-host it on R2** — never store Tripo's URL as the item's model URL, or the dish will go dead the next day.
- **Server-side only.** The Tripo API key is a secret loaded from `.env` (per §7.1). The call flow is always **browser → your API → Tripo**. The key must **never** reach the React frontend, or anyone could read it from dev tools and spend your credits.
- **Failure handling.** Handle invalid images, auth failures, rate limits, timeouts, and failed generations. Log the `task_id` for every job. Do **not** blindly retry a job that failed on bad input — flag it for QA instead.
- **Optional quality boost.** Tripo's multiview endpoint accepts 2–4 images of the same dish for a better model — useful for hero dishes where a single photo isn't enough.

### 11.5 End-to-end sequence
`owner uploads photo → backend stores original on R2 → backend POSTs to Tripo (server-side, key from .env) → Tripo returns task_id → webhook/poll until FINISHED → backend downloads GLB → converts to USDZ → uploads both to R2 → item enters QA → admin approves → status live, model URLs saved → diner scans QR → model-viewer loads GLB (Android) / USDZ (iOS) from R2.`

---

## 12. Definition of Done

A feature is complete only when:
- It works end to end and is covered by tests.
- **All applicable §7 security requirements are implemented and verified.**
- No secrets are in the code; `.env.example` is updated.
- Inputs are validated server-side; DB access is parameterized.
- Rate limiting is in place on the new endpoints.
- Any file upload path enforces the full §7.5 checklist.
- Lint/format/tests pass in CI.
- The `README`/API docs are updated.

---

*This spec is the source of truth for the build. If a requirement here conflicts with a shortcut, the requirement wins. When in doubt, choose the more secure option.*
