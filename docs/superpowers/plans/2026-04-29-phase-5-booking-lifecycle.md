# Phase 5 — Booking Lifecycle (reschedule, cancel, detail, list, availability, history)

**Spec reference:** `docs/superpowers/specs/2026-04-28-keyloop-scenario-a-scheduler-design.md` §5.1, §5.4 (reschedule), §5.5 (availability).

**Goal:** ship the rest of the appointment surface so the scheduler is end-to-end usable from a client.

## Scope

| # | Endpoint | Notes |
|---|----------|-------|
| 1 | `GET /api/v1/appointments/:id` | Detail; returns `ETag: "<version>"`, supports `If-None-Match` → 304. |
| 2 | `GET /api/v1/appointments` | Cursor pagination (`?cursor=&limit=`), filters: `status`, `technician_id`, `bay_id`, `customer_id`, `from`, `to`. |
| 3 | `PATCH /api/v1/appointments/:id` | Reschedule: change `start_at`, `technician_id`, `bay_id`. `If-Match` required. Optimistic lock via `version`. |
| 4 | `DELETE /api/v1/appointments/:id` | Soft-cancel via FSM (status → `cancelled`). `If-Match` required. |
| 5 | `GET /api/v1/appointments/:id/history` | Audit timeline from `appointment_history`. |
| 6 | `GET /api/v1/availability` | Free 30-min slots for a `service_type_id`, `technician_id`, `from`, `to`. Simplified vs spec Appendix B (skip business hours / shift / time-off in this slice — leaves them for a follow-up). |

## Conventions (already established Phase 4)

- Postgres tstzrange `[lower,upper)`; `computeTimeRange` for DST-safe building.
- Mapping `23P01` (EXCLUDE violation) → `409 BAY_UNAVAILABLE` / `TECHNICIAN_UNAVAILABLE`.
- RLS GUC set inside the transaction.
- Audit row + outbox row written in the same tx as the appointment write.

## Implementation steps

1. **DTOs** (`dtos/`):
   - `reschedule-appointment.schema.ts` — `start_at?`, `technician_id?`, `bay_id?` (at least one required).
   - `list-appointments.schema.ts` — query filters + pagination.
   - `availability.schema.ts` — query params.
2. **Service** (`appointments.service.ts`): add `findById`, `list`, `reschedule`, `cancel`, `history`.
3. **Availability service** (new file `services/availability.service.ts`): SQL CTE returning candidate slots.
4. **Controller** (`appointments.controller.ts`): wire up all routes with `If-Match`/ETag handling.
5. **Tests:**
   - Unit: cursor encode/decode, slot generation algorithm.
   - E2E: reschedule happy path, reschedule 412 on stale version, cancel happy path, FSM rejection (cancel after cancel → 409), list with filters, detail ETag round-trip, availability returns conflict-free slots.

## Out-of-scope (deferred)

- `GET /api/v1/customers?q=`, `GET /api/v1/vehicles?vin=` — Phase 6.
- `GET /api/v1/dealerships/me/*` catalog endpoints — Phase 6.
- GDPR endpoints — Phase 7.
- Full availability with business hours / technician shifts / time-off — Phase 6.

## Definition of done

- All endpoints implemented with TypeORM/raw SQL.
- E2E suite extended; the existing 5 booking tests still pass.
- Unit tests for cursor + availability slot logic.
- Commit on `master`: `feat(booking): reschedule, cancel, detail, list, availability, history (Phase 5)`.
