# ADR-0007 — JWT with refresh rotation over server sessions

**Status:** Accepted
**Date:** 2026-04-28

## Context

The scheduler API needs an authentication scheme that:

- Carries enough identity data (`user_id`, `dealership_id`, `roles`) for RLS context + RBAC.
- Survives a short server restart without forcing every user to log in again.
- Detects token theft (e.g., XSS exfiltrating an access token).
- Plays well with horizontal scaling (no sticky sessions).

Two patterns considered:

1. **Server sessions** (Express-session / Redis-backed). Session ID in a cookie, server stores state. Easy to revoke, requires shared session store, breaks if the FE is on a different origin without complex CORS+credentials wiring.
2. **JWT access tokens + opaque refresh tokens.** Access token is stateless, short-lived (15 min). Refresh token is stored in DB, long-lived (7 days), rotates on use, family-tracked for reuse detection.

## Decision

Pattern 2.

- **Access token.** Signed JWT, 15 min TTL. Carries `sub`, `dealership_id`, `roles`, `jti`. Verified statelessly.
- **Refresh token.** 32-byte random opaque string, sha256 hashed at rest in `refresh_token` table. 7-day TTL. Each refresh rotates: the presented token is marked `revoked_at`, a new one is issued with the same `family_id`.
- **Reuse detection.** If a `revoked_at` token is presented again, *every* token in that `family_id` is revoked. Loud `auth_refresh_token_reuse_total` counter on this path so SOC sees the signal.
- **Logout.** Marks all the user's refresh tokens revoked.
- **Lockout.** 5 failed login attempts in 15 min → account locked for 30 min (HTTP 423).

## Consequences

- Stateless access tokens scale horizontally with no shared store.
- Refresh rotation closes the "stolen access token" window to ≤15 min plus reuse-detection of the refresh.
- Argon2id for password hashing (memory-hard, GPU-resistant).
- Cost: a refresh adds two DB writes (revoke old, insert new). Acceptable; refresh frequency is once per 15 min per active user.
- We deliberately don't put refresh in an HttpOnly cookie because the demo FE is a same-origin SPA and localStorage is fine for the threat model. Production with cross-origin clients should switch to HttpOnly + Secure + SameSite=strict.
