# ADR-0005 — Optimistic locking via `version` column

**Status:** Accepted
**Date:** 2026-04-28

## Context

Two service advisors can both view the same appointment in their dashboards and both try to reschedule it. Last-write-wins silently destroys the first edit. We need lost-update protection.

Two approaches:

1. **Pessimistic lock.** `SELECT ... FOR UPDATE` while the user is editing. Holds DB locks for human-think-time, scales poorly, and the FE would need lock-extension heartbeats.
2. **Optimistic lock.** Each row has a monotonic `version` integer. Updates require `WHERE id = $id AND version = $expected`. The DB increments `version` on every row change via a trigger. If 0 rows are affected, the client's view is stale.

## Decision

Every appointment row has `version INT NOT NULL DEFAULT 1`. A trigger increments it on any update:

```sql
CREATE TRIGGER trg_appt_version BEFORE UPDATE ON appointment
  FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
  EXECUTE FUNCTION increment_appointment_version();
```

The API surface uses HTTP `If-Match: "<version>"` on PATCH/DELETE. Stale → `412 PRECONDITION_FAILED` with `currentVersion` in the body so the client can show "this was modified, refresh and retry."

`GET` responses include `ETag: "<version>"` so clients can populate `If-Match` from the most recent fetch.

## Consequences

- No DB locks for human-think-time.
- Clients must handle 412 explicitly. The demo FE surfaces a refresh prompt.
- The trigger fires on `OLD.* IS DISTINCT FROM NEW.*` so no-op writes don't bump version.
- `optimistic_lock_failures_total` Prometheus counter tracks how often this fires; sustained spikes suggest the FE is showing stale data (e.g. missed `invalidateQueries` after a write).
- Combined with idempotency keys: idempotency dedups *retries*, optimistic locking dedups *concurrent edits*. Different problems, both addressed.
