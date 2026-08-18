---
name: run-backend
description: Build, run, and drive the AR Menu SaaS NestJS backend API. Use when asked to start/run the backend, launch the API, screenshot or smoke-test it, or verify a backend change works in the running app (not just its test suite).
---

This is a NestJS REST API backed by MySQL (via Prisma). It's driven with
`curl` — there's no GUI. The agent path is a single script:
`.claude/skills/run-backend/smoke.sh` (this directory). It brings up MySQL
via docker-compose, builds the workspace, launches the API, and runs a real
signup → restaurant → menu-item flow through curl, including the ownership
security boundary, a real image upload (§7.5: genuine JPEG → validated →
re-encoded to WebP → stored → served back and re-decoded to confirm it's a
valid image) via the local-disk storage driver, and the admin role guard +
QA queue. `smoke.sh` also curl-checks that the public, unauthenticated AR
viewer page (`/api/m/:slug`) responds, but **curl cannot catch CSP/WASM/
rendering bugs in that page** — two were found only by driving it in a
real Chrome tab (see Gotchas: CORP and `wasm-unsafe-eval`). If you touch
`ar-viewer.*`, re-verify live in a browser, not just via this script.
Verified end-to-end from a cold `docker compose down` state in this
container.

All paths below are relative to `backend/` unless noted otherwise.

## Prerequisites

Docker (for local MySQL) and Node 20+. Both were already present in this
container — nothing extra to `apt-get install`.

## Run (agent path)

```bash
.claude/skills/run-backend/smoke.sh
```

This does everything: `docker compose up -d` + wait for MySQL healthy →
`npm install --no-audit --no-fund` at the repo root (which also builds
`shared/` via its `postinstall` hook — see Gotchas) → creates `backend/.env`
with generated secrets if one doesn't exist yet → `prisma migrate deploy` →
builds `shared` then `nest build` → launches `node dist/main.js` on port
4001 → polls `/api/health` until ready → runs the smoke assertions.

On success it prints `ALL SMOKE CHECKS PASSED` and leaves the server
running in the background (PID in `/tmp/ar-menu-backend.pid`, logs in
`/tmp/ar-menu-backend.log`) so you can keep poking at it.

**Fast re-run** once dependencies/build are already in place (skips
install/migrate/build, just relaunches + re-tests — takes a few seconds):

```bash
.claude/skills/run-backend/smoke.sh --no-build
```

**Stop** the server and tear down the MySQL container:

```bash
.claude/skills/run-backend/smoke.sh --stop
```

**Drive it further by hand** once it's running (default port 4001, override
with `PORT=... .claude/skills/run-backend/smoke.sh`):

```bash
curl http://localhost:4001/api/health
curl -X POST http://localhost:4001/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","password":"CorrectHorse123"}'
# → {"user":{...},"accessToken":"..."}  (use as `Authorization: Bearer <token>`)
```

## Run (human path)

```bash
(cd .. && docker compose up -d)  # docker-compose.yml lives at the repo root
npm run start:dev                # watch mode, port from .env's PORT (4001)
```

Blocks the terminal; `Ctrl-C` to stop. Prefer the agent path above for
scripted verification — it's non-blocking and self-checking.

**Create an admin user** (self-serve signup always creates an "owner" —
admin is provisioned out-of-band, see Gotchas):

```bash
ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=CorrectHorse123 npm run seed:admin
```

## Test

```bash
npm run test               # unit — 38 tests
npm run test:e2e           # e2e against a real DB — needs MySQL up + migrated (2 files, 7 tests)
npm run lint
```

## Environment

| Variable | Required | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Set in `backend/.env`; matches `docker-compose.yml`'s `ar_menu`/`ar_menu_dev_password` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Yes | — | `smoke.sh` generates these with `openssl rand` if `.env` doesn't exist |
| `IP_HASH_SALT` | Yes | — | Same — auto-generated |
| `PORT` | No | `4001` | Set in `backend/.env`; `smoke.sh` uses the same default. 3000/3001/5173/3306 are deliberately avoided — kept free for other local uses in this container |
| `API_BASE_URL` | Yes | — | **Must match the port the server actually runs on** — see Gotchas |
| `STORAGE_DRIVER` | No | `local` | `local` writes under `backend/var/uploads` and serves via `GET /api/uploads/...`; `s3` needs the `STORAGE_*` R2/S3 vars (not exercised here — no credentials in this environment) |
| `TRIPO_API_KEY` / `TRIPO_WEBHOOK_SECRET` | No (until you trigger generation) | — | Get a key at platform.tripo3d.ai/api-keys. `smoke.sh` does **not** exercise the real Tripo call (no key available) — that logic is covered by `TripoGenerationService`'s mocked unit tests instead |

App refuses to boot if any required var is missing/too short — see
`src/config/env.validation.ts`.

## Gotchas

- **`<model-viewer>` needs `'wasm-unsafe-eval'` in `script-src`, not just
  `'self'`, or it silently degrades instead of failing loudly.** It
  compiles a WASM module for Draco/KTX2 mesh/texture decoding; without the
  directive, `WebAssembly.instantiate()` throws a CSP `CompileError` in
  the console but a plain uncompressed model can still render (found live:
  a simple test box rendered fine while throwing this error every time —
  a real compressed model would likely fail outright). Only
  `'wasm-unsafe-eval'`, never the broader `'unsafe-eval'` (that also
  allows arbitrary JS `eval`/`new Function`, which the app never needs).
  Scoped to the `/m/:slug` route's own CSP override
  (`ar-viewer.controller.ts`) — curl cannot detect this class of bug at
  all; only a real browser console does.
- **`helmet`'s default `Cross-Origin-Resource-Policy: same-origin` silently
  breaks cross-origin `<img>`/`<model-viewer>` loads of uploaded photos and
  models — and curl-based smoke testing cannot catch it.** The dashboard
  (a different origin/port in dev, and later the diner-facing AR viewer
  loading GLB/USDZ) loads `/api/uploads/...` as a subresource. `curl` and
  `fetch()` both ignore CORP entirely and see a clean 200, but a real
  `<img src>` load gets silently dropped by the browser — no console
  error, `img.complete` is `true`, `naturalWidth`/`naturalHeight` stay `0`.
  Found live in Chrome via `browser_batch` + `javascript_tool`
  (`new Image()` with a cache-busting query param, checking `naturalWidth`
  after `onerror`/`onload`) — curl alone reported everything fine the
  whole time. Fixed in `uploads.controller.ts` by overriding the header to
  `cross-origin` on that response only (the rest of the JSON API correctly
  keeps helmet's stricter default). `smoke.sh` now asserts this header on
  the served photo; if you ever see a photo/model fail to render in a real
  browser while every `curl` check passes, check this header first.
- **`shared` package must be pre-built, or the compiled backend crashes at
  runtime with `ERR_MODULE_NOT_FOUND` for `.../shared/src/enums.js`.**
  `shared/package.json`'s `main`/`types` point at `dist/`, not raw `.ts`
  source — plain `node dist/main.js` can't execute TypeScript directly.
  The root `postinstall` script (`npm run build -w shared`) handles this
  automatically after `npm install`, but if you ever bypass install (e.g.
  `npm install --ignore-scripts`) or edit `shared/src/*.ts` without
  rebuilding, `npm run build -w shared` from the repo root before
  relaunching.
- **`lsof -ti:PORT | xargs -r kill -9` aborts the whole script under
  `set -e -o pipefail` when nothing is listening yet** — `lsof` exits
  non-zero on no matches, and pipefail propagates that even though `xargs
  -r` itself would no-op cleanly. `smoke.sh` appends `|| true` to both
  occurrences; keep that if you copy this pattern elsewhere.
- **Ports 3000/3001/5173/3306 are deliberately avoided in this project's
  defaults** — kept free for other local uses in this container/machine on
  request (an unrelated `pnpm run dev` process also already holds 3000
  here). Current defaults: backend API `4001`, frontend dev server `4173`,
  MySQL host port `3307` (see `docker-compose.yml`, `backend/.env`,
  `frontend/vite.config.ts`). If you ever need to change them again, all
  three files plus `frontend/.env.local`/`.env.example` and this skill's
  `PORT` default need to move together.
- **The `ar_menu` DB user intentionally can't create databases** (least
  privilege — spec requirement). `prisma migrate dev` (which needs a
  shadow DB) fails with `P3014` against it. Migrations are authored once
  against the `root` user (`DATABASE_URL="mysql://root:ar_menu_dev_root_password@localhost:3307/ar_menu_dev" npx prisma migrate dev --name <x>`)
  and committed; `smoke.sh` only ever runs `prisma migrate deploy` (no
  shadow DB needed) against the real `ar_menu` app user.
- **`API_BASE_URL` must match whatever port the server is actually running
  on, or generated URLs (upload links, etc.) 404 or silently hit the wrong
  service.** Hit this for real once when the two had drifted: an uploaded
  photo's returned `photoUrl` pointed at the wrong port, and fetching it
  landed on a *different*, unrelated process on that port instead of
  404ing — confusing to debug. If you change `PORT` in `.env`, update
  `API_BASE_URL` to match in the same edit.
- **`@aws-sdk/client-s3`'s provider must not validate its config in the
  constructor.** Nest eagerly instantiates every provider listed in a
  module — `StorageModule` registers both the local and S3 providers so
  its factory can pick one at runtime — so if `S3StorageProvider` threw on
  missing `STORAGE_*` vars in its constructor, the app refused to boot
  with `STORAGE_DRIVER=local` too, even though S3 was never going to be
  used. Fixed by deferring validation to first use (`getClient()`).
- **Nest eagerly instantiates every provider in a module** (see above) is
  a general trap, not just an S3 one — any provider that validates config
  or opens a connection in its constructor breaks every driver mode that
  doesn't need it, as soon as it's added to the same module.
- **Adding a `.ts` file outside `src/` (e.g. `prisma/seed-admin.ts`) can
  silently break `dist/main.js`'s location.** TypeScript infers `rootDir`
  as the common ancestor of every included file when it's not set
  explicitly; with no `include` restricting `tsconfig.build.json`, that
  file widened the inferred root from `src/` to `backend/`, so the build
  emitted `dist/src/main.js` instead of `dist/main.js` and `node
  dist/main.js` failed with `MODULE_NOT_FOUND`. Fixed by excluding
  `prisma/seed-admin.ts` in `tsconfig.build.json` (it's run via `ts-node`
  directly, never meant to be bundled). If `dist/main.js` goes missing
  again, check `dist/` for an unexpectedly-nested `src/` folder first.

## Troubleshooting

- **`Error: listen EADDRINUSE: address already in use :::4001`** (or
  whatever port is configured): something else already holds it. Check
  with `lsof -ti:4001 -sTCP:LISTEN`, or pick a different free port via
  `PORT=... .claude/skills/run-backend/smoke.sh` (remember to update
  `API_BASE_URL` and `CORS_ALLOWED_ORIGINS` to match — see Gotchas).
- **Script exits silently right after `== 6/6 ==` with no error text**: the
  `lsof | xargs` pipefail issue above, if you've edited the script and
  dropped the `|| true`.
- **`npm install` hangs for a long time with no output change**: seen in
  this container on `npm audit` and on first-time large binary downloads
  (Prisma engines, ~35MB total). `smoke.sh` already passes
  `--no-audit --no-fund`; if it still hangs, check
  `~/.npm/_logs/*-debug-0.log` for the last logged step — engines get
  cached under `~/.cache/prisma` once downloaded, so a retry after killing
  a stuck install is much faster.
