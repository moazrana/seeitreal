---
name: security-checklist
description: Run AR-Menu-SaaS-Development-Spec.md's exact §7 mandatory security checklist (secrets, SQLi/validation, auth/authz, rate limiting, upload security, transport/headers, error handling/logging) against changed or specified code. This is project-specific and complements the general-purpose /security-review skill — use this one when checking compliance against this project's spec, use /security-review for a broader independent audit.
---

Review the target code (current diff, or files/paths the user names) against every subsection of spec §7 that applies. Go subsection by subsection, quoting the specific rule and stating pass/fail/not-applicable with evidence (file:line):

- **§7.1 Secrets & Configuration** — no hardcoded secrets; all from `.env`; `.env` gitignored, `.env.example` has keys with no real values; app validates required env vars at startup and refuses to boot if missing; dev/staging/prod use separate credentials.
- **§7.2 SQL Injection & Input Validation** — all DB access is parameterized via the ORM; every input has server-side DTO validation (`class-validator`) with type/length/format/enum checks; nothing is "cleaned and continued" silently; output rendered into HTML is escaped; CSP is set.
- **§7.3 Authentication & Authorization** — passwords hashed with argon2/bcrypt at a strong work factor, never logged; JWT access tokens short-lived, refresh tokens rotated; every protected endpoint checks role AND ownership of the specific resource (cross-tenant access must 403/404); failed-login lockout/backoff exists.
- **§7.4 Rate Limiting** — global throttling present; stricter limits on login/signup/password-reset/public scan-AR endpoints; limited by IP and by user; expensive/paid actions (e.g. 3D generation) are debounced against rapid repeat firing.
- **§7.5 File Upload Security** — type whitelisted by extension AND MIME; real content verified (magic bytes/re-decode), not just client-supplied metadata; max size/dimensions enforced; uploaded files renamed to a random server-generated name, EXIF stripped; stored outside the web root with no execute permission, served only as static/CDN assets.
- **§7.6 Transport, Headers & CORS** — HTTPS enforced with HTTP→HTTPS redirect; `helmet` headers present; CORS is an explicit allow-list, never `*` on authenticated endpoints; cookies (if used) are `SameSite`/`Secure`/`HttpOnly`.
- **§7.7 Error Handling, Logging & Data Protection** — clients never see stack traces/SQL errors/internal details; auth events, rate-limit hits, and upload rejections are logged; secrets/passwords/tokens/raw payment data are never logged; analytics stores hashed IPs only; DB user has least-privilege grants.

Finish with a summary table of pass/fail/N-A per subsection, and call out anything that's an outright violation (e.g. a hardcoded key, an unauthenticated cross-tenant read) as a blocking issue, not a suggestion.
