# Keyloop Scheduler

A multi-tenant service-appointment scheduler for car dealerships. Customer books a service (oil change, brake replacement, tire rotation) at a specific bay and technician for a specific time. The hard problems are concurrency (two service advisors clicking "Book" for the same slot at the same instant), multi-tenant data isolation (one dealership cannot see another's data), DST-aware time math, and idempotent retries on flaky networks.

This repository implements the design described in [`docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md`](docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md).

---

## Table of contents

1. [Quick start](#quick-start)
2. [Login credentials](#login-credentials)
3. [Solution architecture](#solution-architecture)
4. [Tech stack](#tech-stack)
5. [API reference](#api-reference)
6. [Database schema](#database-schema)
7. [Authentication model](#authentication-model)
8. [Common commands](#common-commands)
9. [Demo flow](#demo-flow)
10. [Code map — what lives where](#code-map--what-lives-where)
11. [Documentation map](#documentation-map)
12. [Production gaps and future work](#production-gaps-and-future-work)
13. [Troubleshooting](#troubleshooting)

---

## Quick start

```bash
git clone <repo-url> keyloop && cd keyloop
pnpm bootstrap     # NOT `pnpm setup` — that's a reserved pnpm subcommand
```

That's it. The script:

1. Verifies prerequisites (Node ≥ 20, pnpm ≥ 9, Docker)
2. Installs dependencies
3. Brings up the **full stack** (Postgres, Redis, Jaeger, Prometheus, Grafana, OTel collector)
4. Runs migrations and seeds demo data (2 dealerships, 20 customers, 30 vehicles, login users)
5. Launches API + web dev servers in parallel — terminal stays attached, Ctrl+C stops everything

About 2 minutes on a clean clone. Subsequent runs are ~10 seconds because Docker images and pnpm cache are warm.

If the stack is already up and you only want to restart the dev servers:

```bash
pnpm dev    # API + web in parallel, no setup work
```

After `pnpm bootstrap`:

| What          | URL                      | Login                                |
| ------------- | ------------------------ | ------------------------------------ |
| **App**       | <http://localhost:3000>  | `admin@nyc-auto.local` / `Demo1234!` |
| API           | <http://localhost:3001>  | JWT bearer (see auth section)        |
| Grafana SLOs  | <http://localhost:3030>  | anonymous admin                      |
| Prometheus    | <http://localhost:9090>  | —                                    |
| Jaeger traces | <http://localhost:16686> | service: `scheduler-api`             |

---

## Login credentials

Two dealerships are seeded so you can prove RLS isolation by signing in as each.

| Email                  | Password    | Roles                        | Dealership       | Timezone            |
| ---------------------- | ----------- | ---------------------------- | ---------------- | ------------------- |
| `admin@nyc-auto.local` | `Demo1234!` | `service_advisor`, `manager` | NYC Auto Service | America/New_York    |
| `admin@la-auto.local`  | `Demo1234!` | `service_advisor`, `manager` | LA Auto Service  | America/Los_Angeles |

Sign in as the first one, browse customers and book an appointment. Sign out, sign in as the second — you cannot see any of the first dealership's data. That's Row Level Security working at the database layer (not at the app layer).

Tests also create their own users on demand:

- `booking-test@example.com` / `CorrectHorseBatteryStaple!`
- `lifecycle-test@example.com` / `CorrectHorseBatteryStaple!`
- `catalog-test@example.com` / `CorrectHorseBatteryStaple!`

---

## Solution architecture

```
                ┌─────────────────────────────────────────────────────────────┐
                │                                                             │
                │  Browser  ─────HTTPS / JWT────►  Next.js (port 3000)        │
                │                                  ▲                          │
                │                                  │ TanStack Query           │
                │                                  ▼                          │
                │                              ┌───────────┐                  │
                │                              │  NestJS   │                  │
                │                              │  API      │  (port 3001)     │
                │                              │           │                  │
                │   helmet, CORS, JWT guards   │ pino logs │  /metrics        │
                │   problem+json filter        │           │ ──► Prometheus ──┼──► Grafana
                │   global throttler           │ OTel SDK  │ ──► OTLP collector ──► Jaeger
                │                              └─────┬─────┘                  │
                │                                    │                        │
                │           per-tx GUC               │ pg pool (max=20)       │
                │       app.current_dealership       ▼                        │
                │                              ┌───────────┐                  │
                │                              │ Postgres  │ btree_gist       │
                │                              │           │ tstzrange        │
                │                              │  RLS on   │ EXCLUDE constraint
                │                              │ all tables│ FSM trigger      │
                │                              └─────┬─────┘                  │
                │                                    │                        │
                │      Outbox publisher              ▼                        │
                │      polls every 5s         outbox_event ──► Kafka / webhook
                │      FOR UPDATE SKIP LOCKED                                 │
                │                                                             │
                └─────────────────────────────────────────────────────────────┘
```

### Why these choices

**Concurrency: Postgres EXCLUDE constraint over SERIALIZABLE retry.** Two service advisors clicking "Book" in the same instant for the same bay would, under naïve check-then-insert, both pass the read snapshot and both INSERT — phantom write. SERIALIZABLE catches it but requires application-side retry loops. We use `EXCLUDE USING gist (bay_id WITH =, time_range WITH &&) WHERE (status = 'confirmed')` — Postgres rejects the second INSERT immediately at the index level. App maps `23P01` → `409 Conflict`. Fail fast; no retry storm. See ADR-0003.

**Multi-tenant: Postgres Row Level Security with `FORCE ROW LEVEL SECURITY`.** Application-level `WHERE dealership_id = $1` relies on developer discipline; one missing predicate is a cross-tenant leak. RLS pushes scoping down to the DB. App sets `app.current_dealership` GUC at the start of every transaction; policy `USING (dealership_id::text = current_setting('app.current_dealership', true))` rejects rows that don't match. Fails closed if GUC is unset (returns zero rows). See ADR-0002.

**Optimistic locking via `version` column.** PATCH `/appointments/:id` requires `If-Match: "<version>"`. UPDATE clause is `WHERE id = $id AND version = $expected RETURNING *` — if 0 rows match, someone else won. Returns `412 PRECONDITION_FAILED`. Trigger `increment_appointment_version()` bumps the column on actual changes only. See ADR-0005.

**Idempotency keys for retries.** Every POST that creates a resource requires `Idempotency-Key: <ulid>` header. Server stores `(key, request_hash, response)` in `idempotency_record` for 24 hours. Replay with same key + same body returns cached response; same key + different body returns 409. Combined with EXCLUDE: idempotency dedups _retries_, EXCLUDE blocks _true conflicts_. Different problems, both addressed. See ADR-0004.

**Transactional outbox for events.** Service writes both the appointment row AND a row to `outbox_event` in the same DB transaction. A background worker polls `WHERE published_at IS NULL` with `FOR UPDATE SKIP LOCKED` (multi-replica safe), publishes the event, marks `published_at = now()`. Eliminates dual-write. Demo delivers via structured log; production swaps for Kafka or webhooks (single method to replace). See ADR-0006.

**JWT access (15 min) + refresh rotation (7 days).** Access token is stateless. Refresh token is sha256-hashed at rest in `refresh_token` table. Each refresh rotates: presented token marked `revoked_at`, new one issued with same `family_id`. **Reuse detection** — if a `revoked_at` token is presented again, every token in that `family_id` is revoked. Loud `auth_refresh_token_reuse_total` counter signals SOC. Argon2id for password hashing. Account lockout: 5 failures in 15 min → 30-min lock, HTTP 423. See ADR-0007.

**DST handling via wall-clock comparison.** Naïve approach (parse with Luxon, check `isValid`) does NOT catch the spring-forward gap — Luxon silently shifts forward to the next valid instant. Fix: parse the wall-clock components, construct DateTime with target zone, check whether the resulting hour/minute matches the input. If not, the requested local time didn't exist. See `compute-time-range.ts:75-95` and ADR — this is one of the bugs that ships in many scheduler codebases unnoticed.

**Observability stack.** pino for structured logs (with explicit redaction of `authorization`, `password`, `token_hash`); 17 Prometheus metrics covering HTTP latency histograms, booking conflicts by resource, optimistic-lock failures, outbox lag, account lockouts; OpenTelemetry traces via OTLP collector → Jaeger. All vendor-neutral. Local stack auto-provisions a Grafana dashboard from `loadtest/grafana-dashboard.json`. See ADR-0009.

---

## Tech stack

| Layer         | Choice                                        | Why                                                                                  |
| ------------- | --------------------------------------------- | ------------------------------------------------------------------------------------ |
| Runtime       | Node.js 20+                                   | LTS, Express + NestJS support, pino fastest-in-class                                 |
| API           | NestJS 10                                     | Decorator-based DI, mature ecosystem, opinionated structure for a 5-day deliverable  |
| Database      | Postgres 16                                   | `tstzrange` + `btree_gist` + RLS + EXCLUDE constraint, all required by the design    |
| ORM           | TypeORM 0.3 + raw SQL where appropriate       | Decorators for entities; raw SQL for EXCLUDE constraints, RLS context, range queries |
| Cache / queue | Redis (declared, not yet wired)               | Reserved for production rate limit storage; in-memory in dev (ADR-0008)              |
| Time          | Luxon 3                                       | DST-correct, IANA timezone support                                                   |
| Auth          | `@nestjs/jwt`, `passport-jwt`, argon2         | Stateless access tokens + DB-backed refresh                                          |
| Validation    | Zod                                           | TypeScript-first; schema → DTO type via `z.infer`                                    |
| Logs          | nestjs-pino + pino-pretty (dev) / JSON (prod) | Fastest Node logger; structured by default                                           |
| Metrics       | `@willsoto/nestjs-prometheus` + prom-client   | Native exposition; auto-scraped by Prometheus                                        |
| Tracing       | OpenTelemetry SDK + OTLP exporter             | Vendor-neutral; collector forwards to Jaeger in dev                                  |
| Web           | Next.js 15 (App Router) + React 19            | Server components for the dashboard shell, client components for interactive UI      |
| Web styling   | Tailwind 3 + shadcn-style primitives          | No design-system framework, just tokens and primitives                               |
| Web state     | TanStack Query v5                             | Server state cache; client state (form-only) via `useState`                          |
| Web motion    | Framer Motion 11                              | Layout animations, presence orchestration, gesture interactions                      |
| Tests (unit)  | Jest 29                                       | NestJS default; fast, no DB                                                          |
| Tests (int)   | Jest + Testcontainers Postgres                | Race condition + RLS isolation tests with a real DB                                  |
| Tests (e2e)   | Jest + Supertest                              | Full HTTP stack against dev DB                                                       |
| Load tests    | k6                                            | Goja-based JS, easy thresholds, OSS                                                  |

---

## API reference

All endpoints under `/api/v1`. Bearer JWT required unless marked `Public`. Errors follow [RFC 7807 problem+json](https://www.rfc-editor.org/rfc/rfc7807) with stable `code` field.

### Auth

| Method | Path            | Public | Body                  | Returns                                    | Notes                                       |
| ------ | --------------- | ------ | --------------------- | ------------------------------------------ | ------------------------------------------- |
| POST   | `/auth/login`   | yes    | `{ email, password }` | `{ accessToken, refreshToken, expiresIn }` | 5/15 min throttle. Lockout after 5 failures |
| POST   | `/auth/refresh` | yes    | `{ refresh_token }`   | new token pair                             | Rotates refresh; reuse detection on revoked |
| POST   | `/auth/logout`  | no     | —                     | 204                                        | Revokes all refresh tokens for the user     |
| GET    | `/auth/me`      | no     | —                     | `AuthContext`                              | Returns id / email / dealershipId / roles   |

### Appointments

| Method | Path                         | Roles                        | Headers                              | Body                                                                                       | Returns                                  |
| ------ | ---------------------------- | ---------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------ | ---------------------------------------- |
| POST   | `/appointments`              | `service_advisor`, `manager` | `Idempotency-Key: <ulid>` (required) | `{ start_at, customer_id, vehicle_id, service_type_id, technician_id, bay_id }`            | 201 + `Appointment` + `ETag`             |
| GET    | `/appointments`              | any auth                     | —                                    | query: `from`, `to`, `status`, `technician_id`, `bay_id`, `customer_id`, `cursor`, `limit` | `{ data, next_cursor, has_more }`        |
| GET    | `/appointments/:id`          | any auth                     | `If-None-Match` (optional) → 304     | —                                                                                          | `Appointment` + `ETag`                   |
| GET    | `/appointments/:id/history`  | any auth                     | —                                    | —                                                                                          | `{ data: AppointmentHistoryEntry[] }`    |
| PATCH  | `/appointments/:id`          | `service_advisor`, `manager` | `If-Match: "<version>"` (required)   | partial: `{ start_at?, technician_id?, bay_id? }`                                          | `Appointment` + `ETag` (or 412 on stale) |
| DELETE | `/appointments/:id`          | `service_advisor`, `manager` | `If-Match: "<version>"` (required)   | —                                                                                          | cancelled `Appointment`                  |
| GET    | `/appointments/availability` | any auth                     | —                                    | query: `service_type_id`, `from`, `to`, `technician_id?`, `bay_id?`                        | `{ data: AvailabilitySlot[] }`           |

### Catalog

| Method | Path                             | Cache                  | Returns                                |
| ------ | -------------------------------- | ---------------------- | -------------------------------------- |
| GET    | `/dealerships/me`                | none                   | `Dealership` (id, name, timezone)      |
| GET    | `/dealerships/me/service-types`  | `private, max-age=300` | `{ data: ServiceType[] }`              |
| GET    | `/dealerships/me/technicians`    | `private, max-age=300` | `{ data: Technician[] }` (with skills) |
| GET    | `/dealerships/me/bays`           | `private, max-age=300` | `{ data: Bay[] }`                      |
| GET    | `/dealerships/me/business-hours` | `private, max-age=300` | `{ hours: [...], exceptions: [...] }`  |

### Customers (GDPR)

| Method | Path                         | Roles                        | Body                  | Returns                                 |
| ------ | ---------------------------- | ---------------------------- | --------------------- | --------------------------------------- |
| GET    | `/customers`                 | `service_advisor`, `manager` | query: `q?`, `limit?` | `{ data: Customer[] }`                  |
| GET    | `/customers/:id`             | `service_advisor`, `manager` | —                     | `Customer`                              |
| GET    | `/customers/:id/data-export` | `manager`                    | —                     | `{ customer, vehicles, appointments }`  |
| DELETE | `/customers/:id`             | `manager`                    | `{ reason: string }`  | anonymized `Customer` (REDACTED + NULL) |

### Vehicles

| Method | Path        | Returns                                                  |
| ------ | ----------- | -------------------------------------------------------- |
| GET    | `/vehicles` | `{ data: Vehicle[] }` (filter by `vin?`, `customer_id?`) |

### Operational

| Method | Path                | Auth | Returns                      |
| ------ | ------------------- | ---- | ---------------------------- |
| GET    | `/health/liveness`  | no   | `{ status: "ok" }`           |
| GET    | `/health/readiness` | no   | DB ping result via Terminus  |
| GET    | `/metrics`          | no   | Prometheus exposition format |

### Stable error code enum

Every 4xx response has a stable `code` field. Client code switches on it.

```
INVALID_CREDENTIALS, ACCOUNT_LOCKED, TOKEN_INVALID, TOKEN_REVOKED,
BAY_UNAVAILABLE, TECHNICIAN_UNAVAILABLE, BOOKING_CONFLICT,
INVALID_LOCAL_TIME, OUTSIDE_BUSINESS_HOURS, DEALERSHIP_CLOSED,
TECHNICIAN_OFF_SHIFT, TECHNICIAN_LACKS_SKILL,
INVALID_STATUS_TRANSITION, IDEMPOTENCY_KEY_REQUIRED,
IDEMPOTENCY_KEY_CONFLICT, IF_MATCH_REQUIRED, PRECONDITION_FAILED,
RATE_LIMIT_EXCEEDED, ALREADY_ANONYMIZED
```

---

## Database schema

19 tables. Migrations live in `packages/api/src/migrations/`.

### Core domain

- **`dealership`** — tenant root (id, name, timezone)
- **`app_user`** — JWT subjects (id, dealership_id, email, password_hash, roles, locked_until)
- **`refresh_token`** — sha256-hashed; `family_id` for rotation + reuse detection
- **`failed_login_attempt`** — feeds the lockout window calculation
- **`customer`** — first/last name, email, phone; `anonymized_at` + `anonymization_reason` for GDPR
- **`vehicle`** — VIN, make, model, year; FK to customer
- **`skill`** — code + name (e.g., OIL_CHANGE, BRAKES, EV_CERTIFIED)
- **`service_type`** — name, duration_minutes, buffer_minutes, optional `required_skill_id`
- **`bay`** — name, is_active
- **`technician`** — first/last name, employee_code, is_active
- **`technician_skill`** — many-to-many junction
- **`technician_shift`** — day_of_week + shift_start/end (Mon-Fri 8-17, Sat 9-13 in seed)
- **`technician_time_off`** — daterange with EXCLUDE on overlap
- **`business_hours`** — day_of_week + open_time/close_time per dealership
- **`business_hours_exception`** — date-specific override (closed days, holiday hours)

### Operational

- **`appointment`** — heart of the system. `time_range tstzrange`, `status enum`, `version int`, two partial EXCLUDE constraints (bay + technician), FSM trigger, version trigger, RLS policy
- **`appointment_history`** — append-only audit; written in same tx as appointment writes
- **`idempotency_record`** — 24h cache for POST replay dedup
- **`outbox_event`** — transactional outbox; `published_at IS NULL` partial index for the worker

### Key constraints / triggers

- `appt_bay_no_overlap`, `appt_technician_no_overlap` — partial EXCLUDE constraints
- `enforce_appointment_status_fsm` — only allows `confirmed → {completed, cancelled, no_show}`
- `increment_appointment_version` — bumps version when `OLD.* IS DISTINCT FROM NEW.*`
- `set_updated_at` — generic timestamp maintenance
- `tenant_isolation` — RLS policy on every multi-tenant table

Full DDL in [Appendix A of the design doc](docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md#appendix-a--full-ddl).

---

## Authentication model

| Aspect                  | Setting                                                             |
| ----------------------- | ------------------------------------------------------------------- |
| Access token            | Signed JWT, 15-min TTL, `{ sub, dealership_id, roles, jti }`        |
| Refresh token           | 32-byte random, sha256 at rest, 7-day TTL, `family_id` for rotation |
| Password hash           | argon2id (memory-hard, GPU-resistant)                               |
| Lockout                 | 5 failures / 15 min → 30-min lock (HTTP 423)                        |
| Refresh reuse detection | Presenting a revoked token → entire `family_id` revoked             |
| Rate limit (login)      | 5 / 15 min per IP                                                   |
| Rate limit (refresh)    | 10 / 5 min per IP                                                   |
| Roles                   | `service_advisor`, `manager`, `technician`                          |

### Roles vs endpoints

- `service_advisor` + `manager` — book/reschedule/cancel appointments
- `manager` — anonymize customer (GDPR), data export
- `technician` — read-only access to appointments and catalog
- Any authenticated user — list appointments, view customers/vehicles, browse catalog

### Frontend auth

- Tokens persisted in `localStorage` (FE only loads on `localhost`; for production add HttpOnly cookie + CSRF token)
- Singleton refresh-on-401 in `lib/api.ts` prevents thundering herd when many requests race a 401

---

## Common commands

```bash
pnpm bootstrap                              # one-command bootstrap (idempotent)
pnpm dev                                    # API + web in parallel (assumes stack is up)
pnpm typecheck                              # all workspaces

# Tests
pnpm --filter @keyloop/api test:unit        # ~12s, no DB
pnpm --filter @keyloop/api test:int         # ~30s, testcontainers
pnpm --filter @keyloop/api test:e2e         # ~45s, uses dev DB

# Database
pnpm --filter @keyloop/api migration:run    # apply migrations as scheduler_owner
pnpm --filter @keyloop/api seed:dev         # truncate + reseed everything (incl. login users)

# Load tests (proves the SLOs)
k6 run loadtest/booking-contention.js       # 30 VUs race for 1 slot → 1 win, 29 lose
k6 run loadtest/booking-soak.js             # ~3 min mixed read/write/patch

# Reset everything
docker compose down -v                      # wipe DB volume
pnpm bootstrap                              # fresh start

# Convenience for psql during demo
alias psql-dev='PGPASSWORD=owner psql -U scheduler_owner -h localhost -d scheduler'
psql-dev -c "SELECT count(*) FROM appointment;"
```

---

## Demo flow

3-minute clickthrough — every API endpoint touched at least once:

1. Sign in.
2. **Customers** → click any row → see vehicles + appointments.
3. **Appointments** → **Book appointment** → pick service → slot → Book. Toast confirms.
4. Open the same appointment in two tabs. Reschedule in tab A. In tab B, click reschedule → red "Modified by someone else" banner with horizontal shake — that's the optimistic-locking 412 visualized.
5. **Day view** — see your booking as a positioned block.
6. **Customer detail** → "Anonymize (GDPR)" → confirm by typing DELETE → first/last name become "REDACTED" but the appointment stays (audit-retention by design).
7. Sign out → sign in as the other dealership → you cannot see the first one's data (RLS).

For the full evaluation walkthrough, see [`docs/video-script.md`](docs/video-script.md). For each problem mapped to UI action + code anchor + DB query, see [`docs/demo-cheatsheet.md`](docs/demo-cheatsheet.md).

---

## Code map — what lives where

For a reviewer skimming the codebase: each spec problem → file:line solving it, the database artifact (constraint / trigger / table), and how to verify the effect.

| Spec problem                           | Code (file:line)                                                                                                                                                                                                  | Database artifact                                                                                                 | How to verify                                                                                                                                                                               |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Concurrency / overlap** (§6 EXCLUDE) | `migrations/1700000000002-CreateAppointment.ts:43-48` (constraints), `appointments/services/db-error-translator.ts:12,34,42` (translate `23P01` → 409 with bay/technician branch)                                 | `appt_bay_no_overlap`, `appt_technician_no_overlap` partial EXCLUDE constraints with `tstzrange` + `btree_gist`   | `k6 run loadtest/booking-contention.js` → `bookings_won=1, bookings_lost=29`. API logs show 29× `appt_bay_no_overlap` violation                                                             |
| **Optimistic locking** (§9.2)          | `migrations/1700000000002-CreateAppointment.ts:105-114` (trigger), `appointments/services/appointments.service.ts:420-453` (`applyOptimisticUpdate` — UPDATE WHERE version, throws `PreconditionFailedException`) | `appointment.version` column + `increment_appointment_version()` trigger fires on `OLD.* IS DISTINCT FROM NEW.*`  | Two-tab reschedule. Stale tab gets `412 PRECONDITION_FAILED`. `optimistic_lock_failures_total` counter                                                                                      |
| **DST gap detection** (§8.2)           | `appointments/domain/compute-time-range.ts:70-99` (wall-clock parse + comparison)                                                                                                                                 | (none — pure logic)                                                                                               | `pnpm --filter @keyloop/api test:unit -- compute-time-range` → all 7 pass incl. spring-forward. `dst_validation_failures_total` counter                                                     |
| **Booking validators** (§5.4)          | `appointments/domain/validators.ts:46,83,108,191` (4 validators)                                                                                                                                                  | Reads `business_hours`, `business_hours_exception`, `technician_shift`, `technician_time_off`, `technician_skill` | Sunday slot → 409 `DEALERSHIP_CLOSED`. Brake Pad + tech without skill → 409 `TECHNICIAN_LACKS_SKILL`                                                                                        |
| **Availability intersection** (§5.5)   | `appointments/services/availability.service.ts:88` (`findSlots`), `:123-129` (parallel loads), `:314` (`computeAvailableWindows`), `:368` (`emitSlots`)                                                           | Reads same 4 tables as validators in parallel                                                                     | Booking dialog slot grid only shows weekdays inside business hours intersected with shifts                                                                                                  |
| **Idempotency** (§9.1)                 | `appointments/services/idempotency.service.ts:20-41`, `appointments/controllers/appointments.controller.ts:63-96`                                                                                                 | `idempotency_record` table with sha256 request hash, 24h TTL                                                      | Replay POST with same `Idempotency-Key` → same response, single row in DB                                                                                                                   |
| **Multi-tenant RLS** (§7.5)            | `migrations/1700000000001-CreateBaseTables.ts:273-282` (FORCE policies), `shared/db/rls-context.ts:30-39` (`applyRlsContext` helper)                                                                              | `tenant_isolation` policy on every table; `app.current_dealership` GUC set per-tx                                 | Sign in as different dealership → no cross-tenant data. Integration test `rls-isolation.int-spec.ts`                                                                                        |
| **GDPR anonymize** (§4.5)              | `customers/services/customers.service.ts:75-100`                                                                                                                                                                  | `customer.anonymized_at`, `customer.anonymization_reason` columns; outbox event in same tx                        | UI flow → `psql-dev -c "SELECT first_name, email, anonymized_at FROM customer WHERE id='<id>';"` shows REDACTED + NULL + timestamp                                                          |
| **Audit history** (§4.3)               | `appointments/services/appointment-history-recorder.ts:14,24` (`record()` called inside book/reschedule/cancel tx)                                                                                                | `appointment_history` table; rows are append-only                                                                 | `psql-dev -c "SELECT field, changed_at FROM appointment_history WHERE appointment_id = '<id>' ORDER BY changed_at;"`                                                                        |
| **Transactional outbox** (§9.3)        | `appointments/services/outbox-emitter.ts:9-25` (in-tx INSERT), `outbox/services/outbox-publisher.service.ts:60-95` (poll + claim + lag gauge)                                                                     | `outbox_event` table; `idx_outbox_unpublished` partial index                                                      | `psql-dev -c "SELECT event_type, occurred_at, published_at FROM outbox_event ORDER BY occurred_at DESC LIMIT 5;"` — `published_at` populates ~5s after creation. `outbox_lag_seconds` gauge |
| **JWT + refresh rotation** (§7.1-7.3)  | `auth/services/auth.service.ts` (issue, refresh + reuse detect — log identifiers are sha256-prefixed)                                                                                                             | `refresh_token` table with `family_id`, sha256 of token, `revoked_at`                                             | Reuse a revoked refresh → entire family revoked, `auth_refresh_token_reuse_total` counter increments                                                                                        |
| **Account lockout** (§7.2)             | `auth.service.ts:53-67`                                                                                                                                                                                           | `failed_login_attempt` table; `app_user.locked_until`                                                             | 6 wrong logins in 15 min → `423 ACCOUNT_LOCKED`. `accounts_locked_total` counter                                                                                                            |
| **Rate limit** (§7.7)                  | `app.module.ts:74-82` (global tiers), `auth/controllers/auth.controller.ts:24,37` (per-route)                                                                                                                     | (in-memory; Redis docs in ADR-0008)                                                                               | 6 logins in 15 min → 429. `rate_limit_exceeded_total{route}` counter                                                                                                                        |
| **problem+json errors** (§5.2)         | `shared/filters/problem-details.filter.ts`                                                                                                                                                                        | (none — middleware)                                                                                               | Any 4xx/5xx response: `Content-Type: application/problem+json` with stable `code` enum                                                                                                      |
| **Metrics** (§10.2)                    | `observability/observability.module.ts:18-95` (17 providers), `metrics.service.ts:23-58` (handles)                                                                                                                | (Prometheus exposition)                                                                                           | `curl :3001/metrics \| grep appointments_created_total`                                                                                                                                     |
| **Tracing** (§10.3)                    | `tracing.ts:25-50` (NodeSDK + OTLP exporter)                                                                                                                                                                      | (none)                                                                                                            | After any UI action, Jaeger UI at <http://localhost:16686> shows `scheduler-api` traces                                                                                                     |

---

## Documentation map

- **Design rationale (~14k words):** [`docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md`](docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md)
- **Spec-vs-code audit:** [`docs/superpowers/specs/2026-04-29-spec-vs-code-gap-audit.md`](docs/superpowers/specs/2026-04-29-spec-vs-code-gap-audit.md)
- **ADRs (10):** [`docs/adrs/`](docs/adrs/) — every non-obvious decision has one
- **Implementation plans per phase:** [`docs/superpowers/plans/`](docs/superpowers/plans/)
- **Video script (17 min):** [`docs/video-script.md`](docs/video-script.md)
- **Demo cheat-sheet (file:line + DB queries):** [`docs/demo-cheatsheet.md`](docs/demo-cheatsheet.md)
- **End-to-end testing guide:** [`docs/e2e-testing-guide.md`](docs/e2e-testing-guide.md)

---

## Production gaps and future work

Things deliberately deferred. Each has an ADR or doc reference explaining the trade-off.

| Gap                                | Status                                                                                            | Plan                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **Redis-backed rate limiter**      | In-memory only — works on single replica, breaks under multi-replica                              | One-line config swap (ADR-0008). `rate_limit_exceeded_total` already instrumented                        |
| **Outbox publisher delivery**      | Logs the event payload; doesn't actually publish to Kafka/SNS/webhook                             | One method to swap. Worker plumbing (poll, claim, mark published) is real                                |
| **typeorm-transactional adoption** | Library is in deps, not initialized. Without it, a global RLS interceptor can't propagate the GUC | Multi-day refactor (ADR-0009). Per-service `applyRlsContext()` helper is the current canonical mechanism |
| **PgBouncer**                      | Direct pg pool only                                                                               | Documented in ADR-0009; spec §7.9 calls out the prepared-statement caveat                                |
| **Backup / DR runbook**            | Schema and data are seedable, but no S3 cold storage or restore drill documented                  | Future phase                                                                                             |
| **Frontend production UX**         | Demo client. Mobile responsive, dark mode toggle, full a11y audit deferred                        | A separate effort                                                                                        |
| **Swagger UI**                     | OpenAPI docs covered by this README; no `/api/docs` mount                                         | Deferred — written docs are the source of truth                                                          |

The bigger meta trade-off: choosing **EXCLUDE constraint** over SERIALIZABLE retry as the primary concurrency defense shaped most other decisions (partial constraint, FSM, cancel-frees-slot semantic, idempotency layer). The contention load test proves it works. If you disagreed with that call, every decision downstream would shift.

---

## Troubleshooting

If `pnpm bootstrap` fails, the script tells you which step. The most common ones:

| Symptom                                      | Fix                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| `port 5432 already in use`                   | `lsof -i :5432`, kill the system Postgres OR change `POSTGRES_PORT` in `.env` |
| `port 3000 already in use`                   | Other Next.js / dev tool running. `lsof -i :3000`                             |
| `Login returned "Invalid credentials"`       | Re-seed: `pnpm --filter @keyloop/api seed:dev`                                |
| `Husky pre-commit fails (CI without pnpm)`   | `git commit --no-verify`                                                      |
| `FE typecheck complains about RouteImpl`     | `rm -rf packages/web/.next` and re-run                                        |
| `ECONNREFUSED on port 5432 in API logs`      | Postgres container down. `docker compose --profile observability up -d`       |
| `429 RATE_LIMIT_EXCEEDED on contention test` | Confirm restart: API picked up the `@SkipThrottle()` on POST `/appointments`  |
| `pnpm setup says "no changes"`               | `pnpm setup` is a built-in pnpm subcommand. Use `pnpm bootstrap` instead      |

For anything else, see [`docs/e2e-testing-guide.md`](docs/e2e-testing-guide.md) § Troubleshooting cheatsheet.
