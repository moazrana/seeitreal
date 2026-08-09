---
name: dod-check
description: Check a just-finished feature or change against AR-Menu-SaaS-Development-Spec.md's §12 Definition of Done before calling it complete. Use when the user asks "is this done", "ready to merge", or after finishing a feature slice from the build order in §9.
---

Walk the change (current diff, or whatever the user points at) against spec §12, item by item. For each, state pass/fail with a one-line reason — don't just assert "done":

1. **Works end to end and is covered by tests** — unit tests for services touched, integration tests if auth/billing/uploads were touched, e2e if this completes a build-order slice (§9).
2. **All applicable §7 security requirements implemented and verified** — run through whichever of §7.1–§7.7 apply to the changed code (use `/security-checklist` for the detailed pass).
3. **No secrets in code** — grep the diff for hardcoded keys/passwords/tokens; confirm `.env.example` was updated if new env vars were introduced.
4. **Inputs validated server-side; DB access parameterized** — every new endpoint has a DTO with `class-validator` rules; no raw string-concatenated SQL.
5. **Rate limiting in place** on any new endpoint, stricter on auth/scan/AR/expensive-operation endpoints.
6. **File upload paths** (if touched) meet the full §7.5 checklist — type whitelist by extension AND MIME, magic-byte check, size/dimension limits, random filename, EXIF stripped, non-executable storage.
7. **Lint/format/tests pass** — actually run them, don't assume.
8. **README/API docs updated** if setup steps, env vars, or endpoints changed.

End with a clear verdict: either "Done" or a numbered list of what's missing before it can be called done.
