# Load tests

Two k6 scripts that prove the booking system handles concurrency safely and meets the SLOs from the design doc §10.6.

## What's tested

| Script | Purpose | Pass criteria |
|---|---|---|
| `booking-contention.js` | 30 VUs all try to book the *same* slot simultaneously. Verifies the Postgres `EXCLUDE` constraint serializes them at the DB layer — exactly one wins. | `bookings_won == 1`, `bookings_lost == 29`, loser p99 < 250ms (constraint fails fast, no SERIALIZABLE retry storm), winner p99 < 500ms. |
| `booking-soak.js` | 10 VUs sustained over ~3 min. 70% reads, 30% writes. Validates SLOs under realistic mixed load. | p99 read < 200ms, p99 write < 500ms, 5xx rate < 0.1%. |

## Prerequisites

1. The API must be running on `http://localhost:3001` (or override `API_BASE`).
2. The database must be seeded:
   ```bash
   pnpm --filter @keyloop/api seed:dev
   ```
3. The `lifecycle-test@example.com` fixture (created by the e2e test) must exist. Run it once if needed:
   ```bash
   pnpm --filter @keyloop/api test:e2e -- --testPathPattern=lifecycle
   ```
   The `beforeAll` hook persists the customer + vehicle + user used by the load tests.
4. Install k6:
   ```bash
   brew install k6     # macOS
   # or: https://k6.io/docs/getting-started/installation/
   ```

## Running

```bash
# 1. Contention proof (~60s)
API_BASE=http://localhost:3001 \
API_EMAIL=lifecycle-test@example.com \
API_PASSWORD='CorrectHorseBatteryStaple!' \
k6 run loadtest/booking-contention.js

# 2. Soak / SLO validation (~3 min)
k6 run loadtest/booking-soak.js
```

Each script writes a JSON results file (`results-contention.json`) and prints a summary to stdout.

## Expected output — contention test

```
contention_test:
  vus: 30
  bookings_won: 1
  bookings_lost: 29
  bookings_unexpected: 0
  winner_p99_ms: 78
  loser_p99_ms: 41
  thresholds: { 'count==1': { ok: true } }

✓ bookings_won..............: count=1   (threshold count==1 ok)
✓ bookings_lost.............: count=29  (threshold count==29 ok)
✓ http_req_duration{outcome:lost}: p(99)=41ms  (threshold p(99)<250 ok)
✓ http_req_duration{outcome:won} : p(99)=78ms  (threshold p(99)<500 ok)
```

The interesting result is `loser_p99_ms < winner_p99_ms`: losers fail fast because the `EXCLUDE` constraint check happens before commit and raises `23P01` immediately. There's no SERIALIZABLE-style transaction retry — the API translates `23P01` to `409 BAY_UNAVAILABLE` / `409 TECHNICIAN_UNAVAILABLE` and returns. This is the headline win of the design.

## Expected output — soak test

```
✓ error_rate................: rate=0.000  (threshold rate<0.001 ok)
✓ read_latency_ms...........: p(99)=120ms (threshold p(99)<200 ok)
✓ write_latency_ms..........: p(99)=380ms (threshold p(99)<500 ok)
```

## Interpreting failures

| Threshold breach | Likely cause | Where to look |
|---|---|---|
| `bookings_won != 1` | EXCLUDE constraint missing or partial WHERE wrong | `migrations/1700000000002-CreateAppointment.ts`, lines defining `appt_bay_no_overlap` and `appt_technician_no_overlap` |
| `read p99 > 200ms` | Missing index on `appointment(dealership_id, status)` or `lower(time_range)` | `migrations/1700000000002`, `Index(['dealership_id', 'status'])` on `Appointment` entity |
| `write p99 > 500ms` | Audit/outbox writes not batched, or pg connection pool exhausted | `appointments.service.ts` book/reschedule, `app.module.ts` TypeORM config |
| `error_rate > 0.1%` | Unhandled exception or RLS context leak | Check `/metrics` for `http_requests_total{status="500"}`, then OTel trace in Jaeger for the failing request_id |

## Observability stack

While the soak test runs, check:

- **Prometheus:** http://localhost:9090 — query `rate(http_requests_total[1m])` to see throughput
- **Grafana:** http://localhost:3030 — anonymous admin access, dashboard `Keyloop Scheduler — SLO Dashboard` is auto-provisioned from `loadtest/grafana-dashboard.json`. Panels show read/write p99, 5xx error rate, booking conflicts by resource, and idempotency cache hit ratio.
- **Jaeger:** http://localhost:16686 — pick service `keyloop-api`, drill into a slow request

Bring up the stack with:
```bash
docker compose --profile observability up -d
```

The Grafana provisioning files live in `loadtest/grafana/provisioning/`. The Prometheus datasource is auto-wired and the dashboard is loaded on container start; no manual import step.
