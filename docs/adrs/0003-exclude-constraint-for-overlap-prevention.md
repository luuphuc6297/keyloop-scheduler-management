# ADR-0003 — EXCLUDE constraint with `tstzrange` for booking overlap prevention

**Status:** Accepted
**Date:** 2026-04-28

## Context

The scheduler must prevent two confirmed appointments from sharing the same bay or technician at the same time. Under contention, classic check-then-insert produces phantom-write races even at SERIALIZABLE because Postgres can serialize the read snapshot before the conflicting INSERT commits. Three approaches were evaluated:

1. **SERIALIZABLE transactions + retry loop.** Application reads existing bookings, decides "no conflict," inserts. Postgres detects serialization anomalies and aborts one of the racing transactions. The app must retry. Adds latency, complicates the success path, and becomes a tarpit under sustained contention.
2. **Advisory locks (`pg_advisory_xact_lock`).** Hash the (bay_id, day) tuple and lock on it. Works, but requires careful key design and serializes work that doesn't actually collide (different time slots on the same day).
3. **Postgres `EXCLUDE` constraint with GiST + `tstzrange`.** A built-in declarative constraint: "no two rows where `bay_id` is equal AND `time_range` overlaps." Postgres enforces it at insert/update time using a btree-gist index. One row wins, the other gets `23P01` immediately.

## Decision

Use `EXCLUDE USING gist (bay_id WITH =, time_range WITH &&) WHERE (status = 'confirmed')` on `appointment`, plus the equivalent for `technician_id`. The partial `WHERE` means cancelled appointments don't block re-booking the slot.

The application maps `23P01` to a `409 Conflict` with a stable error code (`BAY_UNAVAILABLE` / `TECHNICIAN_UNAVAILABLE`).

## Consequences

- The DB is the single source of truth for overlap correctness. Application layer cannot accidentally bypass it.
- Failure is fast. The contention load test shows loser p99 < 50ms; there's no SERIALIZABLE retry storm.
- We can no longer "soft-overlap" appointments without dropping or relaxing the constraint. That's a feature, not a bug.
- The `btree_gist` extension must be installed. Done in migration 001.
- `EXCLUDE` constraints don't compose with row-level RLS for INSERT — Postgres evaluates the constraint over the whole table, not the policy-scoped subset. That's actually correct for our use case (we want to prevent overlaps across tenants too, since tenants have disjoint bay/technician IDs).
