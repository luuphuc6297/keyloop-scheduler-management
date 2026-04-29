# ADR-0008 — Rate limit storage: in-memory now, Redis later

**Status:** Accepted
**Date:** 2026-04-28

## Context

`@nestjs/throttler` ships an in-memory storage backend by default. That works for a single API process but breaks under horizontal scaling: each replica counts independently, so the effective limit is `replicas × configured_limit`.

Production options:

1. **In-memory.** Default. Free. Wrong under multi-replica.
2. **Redis.** `@nest-lab/throttler-storage-redis` (or equivalent) makes counts shared. Adds an infra dependency.
3. **Postgres.** Could implement via a `rate_limit_bucket` table. Cheaper to deploy than Redis. Higher latency per check.

## Decision

For the demo: keep the default in-memory storage, single replica. Per-endpoint tuning is in `app.module.ts`:

- `/auth/login` — 5 / 15 min (credential-stuffing defense)
- `/auth/refresh` — 10 / 5 min (token-replay defense)
- `POST /appointments` — 30 / min
- Default — `short` 20/s, `medium` 100/min

For production: switch to Redis. This is one config change in `ThrottlerModule.forRoot` plus a `redis://` URL in env. Documented here so the next person doesn't have to rediscover the choice.

`rate_limit_exceeded_total{route}` Prometheus counter records 429s, so we can see when limits bite — and decide to raise them per route if legitimate traffic is being blocked.

## Consequences

- Demo deploys cleanly on a single replica with no Redis dependency.
- A second replica behind a load balancer would silently double effective limits. Document this in the runbook.
- Switching to Redis is one config change, no code changes.
- Future option: also add per-tenant rate limits for catalog endpoints (each dealership gets X/min) — needs a custom `ThrottlerGuard` keyed on `user.dealershipId` instead of IP.
