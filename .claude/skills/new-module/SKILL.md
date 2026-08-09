---
name: new-module
description: Scaffold a new NestJS module (controller, service, repository, DTOs) in backend/, following this project's layered-architecture and validation conventions. Invoke with /new-module <name>, e.g. /new-module menu-item.
disable-model-invocation: true
---

Scaffold a new backend module named `$ARGUMENTS` under `backend/src/`, following AR-Menu-SaaS-Development-Spec.md and the root CLAUDE.md.

Steps:

1. Confirm the module name (kebab-case) and, from the spec's data model (§5) and feature list (§4), figure out what entity/resource this module owns. If it's ambiguous, ask.
2. Create `backend/src/<name>/`:
   - `<name>.module.ts` — NestJS module wiring controller, service, and (if using TypeORM) repository providers.
   - `<name>.controller.ts` — routes only; no business logic. Every handler that touches a restaurant-scoped resource must verify both the caller's role and that the resource belongs to them (spec §7.3) — never trust a route param alone.
   - `<name>.service.ts` — business logic lives here.
   - `dto/create-<name>.dto.ts` and `dto/update-<name>.dto.ts` — using `class-validator` decorators; validate type, length, format, and allowed range/enum for every field per spec §7.2. Reject invalid input; don't silently coerce it.
   - `entities/<name>.entity.ts` (or Prisma schema addition, matching whatever ORM the repo already uses) — include `id`, `created_at`, `updated_at`, and foreign keys enforced at the DB level, per spec §5's rules. Money fields are integer minor units or `DECIMAL`, never float.
3. If the module needs a schema change, generate a migration — never hand-edit the schema.
4. Add a rate-limit override (`@nestjs/throttler`) if this endpoint is auth-sensitive or otherwise expensive (matches spec §7.4).
5. Stub a test file (`<name>.service.spec.ts`) with at least one happy-path test.
6. Report back what was created and any spec sections the user should double check (e.g. ownership rules, upload handling) before treating the module as done — point them at `/dod-check` for the full pre-completion checklist.

If `backend/` doesn't exist yet, say so and ask whether to scaffold the whole NestJS app first (this skill only adds a module inside an existing Nest project).
