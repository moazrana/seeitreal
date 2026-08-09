# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AR-Menu-SaaS-Development-Spec.md

## Project status

Greenfield — no code exists yet. The spec above is the full build specification (product, data model, security requirements, build order) and is the source of truth. If a shortcut conflicts with the spec, the spec wins; when a choice is left open, pick the more secure option.

## Stack (fixed, do not substitute)

- **Backend:** NestJS (TypeScript), REST API, API-first (same backend will later serve a React Native app).
- **Database:** MySQL via Prisma or TypeORM only — parameterized queries, migrations for every schema change, never hand-edit schema in production.
- **Frontend (dashboard):** React + Vite (TypeScript).
- **Diner AR viewer:** standalone page using Google `<model-viewer>`, serving `.glb` (Android) and `.usdz` (iOS) per dish.
- **3D pipeline:** Tripo API, server-side only, async (webhook + poll fallback) — see spec §11.
- **Auth:** JWT access + rotated refresh tokens, argon2 (or bcrypt) password hashing.
- **Payments:** Stripe (or local gateway) via signature-verified webhooks only — never trust client-side payment state.

## Repo layout

npm workspaces monorepo: `backend/`, `frontend/`, and `shared/` (shared types/DTOs) as workspace packages, single root `package.json` and lockfile. Create this layout when scaffolding begins; add per-workspace `CLAUDE.md` files under `backend/` and `frontend/` once those directories exist, for module-specific instructions.

## Security (spec §7 — mandatory, non-negotiable)

Every item in §7 of the spec must be implemented, not deferred. The highlights Claude must never skip:
- No secrets hardcoded anywhere; all from `.env`, which is gitignored; `.env.example` has keys but no real values; app refuses to boot if a required secret is missing.
- All DB access through the ORM with parameterized queries; every input validated server-side with DTOs + `class-validator`; never trust client-side validation.
- Every protected endpoint checks both role **and** resource ownership — a cross-tenant request must get 403/404, never data.
- Rate limiting (`@nestjs/throttler`) on all endpoints, stricter on auth/scan/AR endpoints, by IP and by user.
- Uploads: image-only, whitelisted by extension AND MIME type, magic-byte verified, size/dimension limited, renamed to a random server-generated name, EXIF stripped, stored outside the web root with no execute permission.
- HTTPS everywhere, `helmet` security headers, explicit CORS allow-list (never `*` on authenticated endpoints).
- Never leak stack traces/SQL errors to clients; never log secrets/passwords/tokens/raw payment data; analytics stores hashed IPs only.

## Coding standards (spec §8)

- Layered architecture: controllers → services → repositories; no business logic in controllers.
- TypeScript strict mode; no `any` unless justified.
- ESLint + Prettier enforced; CI fails on lint errors.
- DTOs + validation at every request/response boundary.
- Tests: unit for services, integration for auth/billing/uploads, at least happy-path e2e for signup → add item → generate model → view AR.
- Small commits, PR review, protected main branch.

## 3D pipeline gotcha (spec §11.4)

The Tripo result URL expires after ~24 hours — always download the GLB immediately and re-host it on object storage (e.g. R2); never store Tripo's URL as the item's model URL. The Tripo API key must never reach the frontend (browser → your API → Tripo only).

## Definition of done (spec §12)

A feature isn't complete until: it works end-to-end with tests, all applicable §7 security items are implemented and verified, no secrets are in code, `.env.example` is updated, inputs are validated server-side, rate limiting is in place, file-upload paths meet the full §7.5 checklist, lint/format/tests pass, and README/API docs are updated. Use the `/dod-check` skill to walk this checklist before calling work done.
