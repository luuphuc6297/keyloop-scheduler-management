# Spec vs Code Gap Audit — Keyloop Scheduler

**Date:** 2026-04-29
**Spec audited:** `docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md`
**Auditor:** systematic walk of every section against `packages/api/**`, `packages/web/**`, `docs/adrs/**`.

Legend: **MET** / **PARTIAL** / **MISSING**. Sizes: S = <2h, M = half day to 1 day, L = multi-day.

---

## §4.2 Entity inventory (15+ tables) — PARTIAL

Migrations create: `dealership`, `app_user`, `refresh_token`, `failed_login_attempt`, `customer`, `vehicle`, `skill`, `service_type`, `bay`, `technician`, `technician_skill`, `technician_shift`, `technician_time_off`, `business_hours`, `business_hours_exception`, `appointment`, `appointment_history`, `idempotency_record`, `outbox_event`. All 19 entities exist (`packages/api/src/migrations/1700000000001-CreateBaseTables.ts`, `1700000000002-CreateAppointment.ts`, `1700000000003-CreateInfrastructure.ts`).

Gap: **RLS enablement is incomplete**. Spec §A.6 enables RLS+FORCE on `appointment_history`, `customer`, `vehicle`, `technician`, `bay`, `service_type`, `business_hours`, `business_hours_exception`, `outbox_event`. The base migration enables it on most, but `1700000000003` does **not** enable RLS on `idempotency_record` (spec is silent — acceptable), and migration 1 enables RLS on `dealership` itself (spec does not list it; harmless but could lock out cross-tenant lookups). No CREATE POLICY for `app_user` / `refresh_token` / `failed_login_attempt` — correct per spec §7.5. Close: S — review and align list.

## §4.3 Appointment schema — MET

`packages/api/src/migrations/1700000000002-CreateAppointment.ts:43-48` has both partial EXCLUDE constraints `WHERE (status = 'confirmed')`. FSM trigger lines 79-102 (only confirmed → completed/cancelled/no_show). Version-increment trigger lines 105-114 (`WHEN OLD.* IS DISTINCT FROM NEW.*`). `set_updated_at` trigger lines 73-76. Half-open / non-empty / bounded / min-duration CHECKs all present. ✓

## §4.5 GDPR Anonymization — MET

`packages/api/src/modules/customers/services/customers.service.ts:78-89` writes `first_name='REDACTED'`, `last_name='REDACTED'`, `email=NULL`, `phone=NULL`, `anonymized_at=now()`, `anonymization_reason=$2`. Outbox event `customer.anonymized` published in same tx (lines 93-98). Endpoint exposed at DELETE `/api/v1/customers/:id` and GET `/api/v1/customers/:id/data-export`. ✓

## §5.1 Endpoint inventory — PARTIAL

Routes implemented (verified by `@Controller` + `@Get/@Post/@Patch/@Delete`):

| Spec | Status |
|---|---|
| POST /auth/login | MET (`auth.controller.ts:20`) |
| POST /auth/refresh | MET (`auth.controller.ts:31`) |
| POST /auth/logout | MET (`auth.controller.ts:41`) |
| GET /auth/me | MET (`auth.controller.ts:47`) |
| POST /appointments | MET |
| GET /appointments | MET |
| GET /appointments/:id | MET |
| PATCH /appointments/:id | MET |
| DELETE /appointments/:id | MET |
| GET /appointments/:id/history | MET |
| GET /availability | MET (mounted under `/appointments/availability`, **not** `/api/v1/availability` — minor route divergence) |
| GET /dealerships/me | MET |
| GET /dealerships/me/service-types | MET |
| GET /dealerships/me/technicians | MET |
| GET /dealerships/me/bays | MET |
| GET /dealerships/me/business-hours | MET |
| GET /customers | MET |
| DELETE /customers/:id | MET |
| GET /customers/:id/data-export | MET |
| GET /vehicles | MET |
| GET /health/liveness | MET |
| GET /health/readiness | MET |
| GET /metrics | MET (Prometheus default `/metrics` from `PrometheusModule.register`) |
| GET /api/docs | **MISSING** — no `SwaggerModule.setup()` anywhere |

Close: Swagger setup is S (15 min). Availability route prefix S.

## §5.2 Stable error code enum (19 codes) — PARTIAL

Emitted: `INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `TOKEN_INVALID`, `TOKEN_REVOKED`, `BAY_UNAVAILABLE`, `TECHNICIAN_UNAVAILABLE`, `BOOKING_CONFLICT`, `INVALID_LOCAL_TIME`, `INVALID_STATUS_TRANSITION`, `IDEMPOTENCY_KEY_REQUIRED`, `IDEMPOTENCY_KEY_CONFLICT`, `IF_MATCH_REQUIRED`, `PRECONDITION_FAILED`, `RATE_LIMIT_EXCEEDED` (mapped in problem-details filter).

**Missing emissions:** `OUTSIDE_BUSINESS_HOURS`, `DEALERSHIP_CLOSED`, `TECHNICIAN_OFF_SHIFT`, `TECHNICIAN_LACKS_SKILL`. None of the four are referenced anywhere in `packages/api/src` (grep confirms). They correspond to validators that are not implemented — see §5.4. Close: M, ties to validator work.

## §5.3 Conventions — PARTIAL

- `Cache-Control: private, max-age=300` on catalog endpoints — **MET** (`dealerships.controller.ts:29,42,55,66`).
- `Cache-Control: no-store` on appointment endpoints — **MISSING**. No `@Header('Cache-Control', 'no-store')` on `appointments.controller.ts`. Close: S.
- `If-None-Match` 304 handling — **MET on GET /appointments/:id only** (`appointments.controller.ts:124-138`). Catalog endpoints do not honor `If-None-Match`. Close: S–M.
- Cursor pagination format — **MET** (`list-appointments.schema.ts:25-50`, base64url JSON `{t,i}`; ordering and cursor comparison in service line 176).
- `X-RateLimit-*` response headers — **MISSING**. They are listed in CORS `exposedHeaders` (`main.ts:41`) but `@nestjs/throttler` v6 does not emit them by default and no custom interceptor sets them. Default tier exists (`app.module.ts:73-76`). Close: S — enable `@nestjs/throttler` 6.x `setThrottlerHeaders` or wrap with custom interceptor.
- Rate-limit response shape — partial: 429 will be mapped by ProblemDetailsFilter to `RATE_LIMIT_EXCEEDED` but `Retry-After` header not explicitly set (depends on Throttler version). Close: S.

## §5.4 Booking validators — MISSING

Spec calls for `validators.businessHours()`, `skillMatch()`, `technicianShift()`, `crossDayDstSafety()` to run inside `book()`. Grep across the appointments module finds **zero matches** for any of these names. The `book()` service (`appointments.service.ts:79-119`) only validates time range and lets the DB raise EXCLUDE violations; no business-hours, no skill, no shift, no time-off, no cross-DST hour-walk validation.

Impact: Bookings can be created outside business hours, on closed exceptions, with technicians lacking the required skill, off-shift, on time-off, or across DST gaps. Close: **L (1-2 days)** — write 4 validators + unit tests + integration tests + emit the 4 missing error codes from §5.2.

## §5.5 Availability — PARTIAL (intentional simplification per code comment)

`availability.service.ts:31-37` explicitly notes: "Simplified vs spec Appendix B: this slice does NOT factor in business hours, technician shifts, or time-off." Implementation only subtracts confirmed bookings from the candidate slot grid. Skill match is honored when no `technician_id` is given (line 123-130).

Gap vs spec §5.5/Appendix B: missing CTEs for business_hours, technician_shift, technician_time_off, business_hours_exception. Close: **L** — port the SQL CTE chain.

## §7.1–7.6 Auth — MET, with minor gap

- JWT 15-min access (`auth.service.ts:15`), 7-day refresh (line 16). ✓
- Family rotation + reuse detection (`auth.service.ts:68-85`). ✓
- Lockout 5 fails / 15 min → 30 min (`auth.service.ts:17-19`, 53-58). ✓
- Argon2id (`auth.service.ts:49`). ✓
- Postgres roles `scheduler_owner` / `scheduler_migrator` / `scheduler_app` declared in `packages/api/db/init/02-roles.sql`. ✓
- RLS `app.current_dealership` GUC — `RlsContextInterceptor` exists (`shared/interceptors/rls-context.interceptor.ts`) but **is never wired** in `app.module.ts` providers/interceptors. Each service sets the GUC manually via `setRlsContext()` inside its own `ds.transaction()` (e.g. `appointments.service.ts:369-372`). Functionally correct but duplicative and bypasses the spec's centralized interceptor pattern (§7.6). Close: M — wire the interceptor as `APP_INTERCEPTOR`, remove per-service `setRlsContext` calls.

## §7.7 Rate Limiting — PARTIAL

`app.module.ts:73-76` registers two global tiers (`short` 20/s, `medium` 100/min) with `ThrottlerGuard` as `APP_GUARD`. **Missing:**
- Per-endpoint overrides — no `@Throttle()` decorator anywhere (grep confirms zero matches).
- 5 / 15 min on `POST /auth/login`, 10 / 5 min on `POST /auth/refresh`, 30 / min on `POST /appointments`, 100 / min default — none of these tiers exist.
- Redis-backed storage (`ThrottlerStorageRedisService`) — not configured; in-memory only.

Close: M — add per-route `@Throttle({...})` decorators and Redis storage.

## §7.8 Helmet + CORS — MET

`main.ts:16-43`: helmet with CSP/HSTS/noSniff/frameguard/referrerPolicy and CORS with credentials, methods, allowedHeaders, exposedHeaders matching spec. ✓

## §7.9 PgBouncer note — MISSING

No mention of PgBouncer in any ADR (only ADR 0001 exists), README, or doc comment. Spec §7.9 says it should be documented for the runbook. Close: S — add a note to README or ADR.

## §8.2–8.3 DST handling — PARTIAL

`compute-time-range.ts` rejects spring-forward gap times via wall-clock round-trip comparison (lines 77-87). ✓ for spring-forward.

Gaps:
- Fall-back ambiguous resolution to earlier offset is **not explicit**. Luxon's `fromObject` default is "earlier" but there is no `X-DST-Resolution: earlier` response header anywhere. Close: S.
- Cross-day / cross-DST hour-walk validation (spec §8.3 `validateRangeDoesNotCrossUnsafeDstTransition`) — **MISSING**. The code does not iterate the range. Close: M.

## §9.3 Transactional Outbox — PARTIAL

Outbox event row written in same tx for `appointment.confirmed` (`appointments.service.ts:110`), `appointment.rescheduled` (line 310), `appointment.cancelled` (line 360), `customer.anonymized` (`customers.service.ts:93-98`). ✓

**Missing:** the relay/publisher worker. No `@Cron` job, no `outbox.module.ts`, no service polls `outbox_event WHERE published_at IS NULL`. Spec §9.3 + project structure §13 both require a worker. Close: M — implement a simple cron-driven publisher with retry + dead-letter; subscriber out of scope per spec.

## §9.4–9.6 Backup, Migration, DR — MISSING (documented-only acceptable)

Spec §9.4 says nightly `pg_dump` + 30-day retention is "out of scope for demo" but should be documented in runbook. No runbook / ADR mentions either. §9.5 zero-downtime migration playbook not documented. §9.6 DR is documented as future-work in the spec itself; acceptable. Close: S — add a one-pager.

## §10.1 Logging — MET

`app.module.ts:34-43` redact paths exactly match spec: `req.headers.authorization`, `req.headers.cookie`, `req.body.password`, `req.body.refresh_token`, `*.password_hash`, `*.token_hash`. ✓ pino-pretty in dev, JSON in non-dev.

## §10.2 Metrics — PARTIAL

Implemented in `observability.module.ts`: `http_request_duration_seconds`, `http_requests_total`, `appointments_created_total`, `bookings_conflict_total`, `idempotency_cache_total`. ✓

**Missing** vs spec table:
- `appointments_status_transition_total`
- `booking_duration_seconds`
- `availability_query_duration_seconds`
- `auth_login_attempts_total`
- `auth_refresh_token_reuse_total`
- `accounts_locked_total`
- `rate_limit_exceeded_total`
- `optimistic_lock_failures_total`
- `outbox_events_total` / `outbox_lag_seconds` / `outbox_events_pending`
- `gdpr_anonymization_total`
- `dst_validation_failures_total`
- `db_pool_size` / `db_pool_active` / `db_query_duration_seconds`

Close: M — add Counter/Histogram providers and emit from corresponding services; some require the outbox worker (§9.3) to exist first.

## §10.3 Tracing — MET

`packages/api/src/tracing.ts` initializes `NodeSDK` with auto-instrumentation, OTLP exporter when `OTLP_ENDPOINT` is set, ConsoleSpanExporter otherwise. Pino instrumentation enabled. Imported as side-effect in `main.ts:1`. ✓ (Custom business spans listed in spec §10.3 are aspirational — auto-instrumentation covers HTTP/Express/PG.)

## §10.5 Health endpoints — MET

`health.controller.ts`: liveness (no checks) + readiness (DB ping with 1000ms timeout). ✓

## §11.5 Race condition test — MET

`packages/api/test/integration/exclude-race.int-spec.ts:168-187`: 10 concurrent identical bookings, asserts exactly 1 succeeds, N-1 fail with `23P01` against either `appt_bay_no_overlap` or `appt_technician_no_overlap`. Also covers half-open boundary, cancelled-frees-slot, non-overlapping. ✓

Note: Test inserts directly via raw SQL as `scheduler_owner` (BYPASSRLS), so it does not exercise the service layer's metrics/audit/outbox writes (`fulfilled.length=1` and audit-count assertions from spec §11.5 are missing). Close: S — promote to integration via `AppointmentsService`.

## §11.7 RLS isolation tests — MET

`packages/api/test/integration/rls-isolation.int-spec.ts`: two dealerships seeded, each tenant's queries only see own customers, WITH CHECK rejects cross-tenant inserts, NULL GUC returns empty. Runs as `scheduler_app` (no BYPASSRLS). ✓

## §12 Frontend — PARTIAL

- Pages: `/login` (MET), `/dashboard` (MET — replaces spec's `/book` + `/appointments`; combines list + booking dialog), `/` redirect (MET via `app/page.tsx`). Spec lists separate `/book` and `/appointments`; current code uses one dashboard with a dialog. Acceptable variation.
- Booking dialog with availability picker — **MET** (`booking-dialog.tsx`, slot grid lines 242-262).
- Reschedule with optimistic-lock conflict UI — **PARTIAL**. `reschedule-dialog.tsx` passes `version` to API and surfaces `err.body.code` (line 44), but the displayed code/message is generic; no specific UX for `PRECONDITION_FAILED` (refresh prompt). Close: S.
- Cancel via DELETE (also requires `If-Match`) — not verified; appointment-list component would need check. Close: S to verify.

## §13 Project structure — PARTIAL

Backend matches spec layout (`packages/api/src/modules/{auth,appointments,customers,vehicles,dealerships,observability,health}/`).

Missing top-level dirs from spec §13:
- `packages/api/src/modules/availability/` — not a separate module; folded into appointments. Acceptable.
- `packages/api/src/modules/catalog/` — not present; folded into dealerships. Acceptable.
- `packages/api/src/modules/outbox/` — **missing entirely** (no worker; ties to §9.3).
- `packages/api/src/modules/idempotency/` — folded into appointments service. Acceptable.
- `packages/api/src/modules/gdpr/` — folded into customers. Acceptable.
- `packages/api/load-tests/` — **missing entirely** (`booking.js`, `availability.js`, `race.js`). Spec §10.6/§11.8 requires these. Close: M.
- ADRs 0002–0009 — only `0001-record-architecture-decisions.md` and `template.md` exist. Spec §13/Appendix C requires 9 ADRs. Close: M.

## Cross-cutting observations

- **Duplicated RLS context setup.** Every service writes its own `setRlsContext()` helper. Spec §7.6 prescribes a single interceptor; the file exists but is unwired (`app.module.ts` has no `RlsContextInterceptor` provider). Centralizing reduces drift risk.
- **No `@Throttle()` overrides** anywhere — every endpoint inherits global default tiers, which fails the spec's per-endpoint tiering requirement and the pen-test-style abuse cases (login flooding, booking spam).
- **Outbox without publisher = dead letters** — events accumulate in `outbox_event` with no `published_at` ever being set. Acceptable as documented future work, but the current `outbox_events_pending` metric (also missing) would be the operational signal.

---

## Top gaps prioritized

1. **Booking validators (businessHours, skillMatch, technicianShift, crossDayDstSafety)** — L. Largest correctness gap; spec lists the 4 corresponding error codes that have zero emit sites.
2. **Outbox publisher worker** — M. Events are persisted but never delivered.
3. **Availability SQL with full CTE chain** — L. Current implementation can offer slots outside business hours / off-shift.
4. **Per-endpoint `@Throttle()` + Redis storage + X-RateLimit-* headers** — M.
5. **8 missing ADRs + load-tests dir + Swagger setup + PgBouncer note + runbook one-pager** — M cumulative documentation hygiene.
6. **Wire `RlsContextInterceptor` globally and drop per-service `setRlsContext()`** — M.
7. **Missing metrics (12 of the 17 in spec §10.2)** — M.
8. **Cross-DST hour-walk validation + X-DST-Resolution header + `Cache-Control: no-store` on appointments + 304 on catalog** — S each.
