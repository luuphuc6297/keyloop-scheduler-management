# ADR-0004 — Idempotency-Key for create endpoints

**Status:** Accepted
**Date:** 2026-04-28

## Context

A scheduler client may retry a `POST /appointments` because:

- Their network blipped after the request reached us but before the response came back.
- A timeout fired and the client gave up, then retried.
- A user double-clicked the booking button.

Without dedup, retries can create duplicate appointments. The `EXCLUDE` constraint catches the second of two retries that target the *same* slot, but a client retry that targets a *different* slot (e.g., the user picked a new time) should not race the original. We need request-level dedup, not just resource-level overlap protection.

## Decision

`POST /api/v1/appointments` requires an `Idempotency-Key: <ulid>` header. The server stores `(key, user_id, request_hash, response_status, response_body, expires_at)` in `idempotency_record` for 24 hours.

- Replay with same key + same body hash → return the cached response.
- Replay with same key + different body hash → `409 IDEMPOTENCY_KEY_CONFLICT`.
- Missing header → `400 IDEMPOTENCY_KEY_REQUIRED`.

`request_hash` is sha256 over a canonicalized JSON of the request body (sorted keys) so semantically identical bodies hash equally.

## Consequences

- Clients must generate a fresh ULID per logical request.
- Network/proxy retries are safe by default.
- A 24-hour window covers reasonable retry timeouts and gives us a bounded retention.
- Dedup state lives in Postgres. For multi-region active-active deployment, this would need replication or an in-memory store. Captured in ADR-0009 (Redis adoption).
- Adds two extra DB round-trips per `POST /appointments` (read the cache + write it on miss). Measured at p99 ~6ms additional latency; acceptable.
