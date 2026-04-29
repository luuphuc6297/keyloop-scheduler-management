# ADR-0006 — Transactional outbox for event publishing

**Status:** Accepted
**Date:** 2026-04-28

## Context

Booking events (`appointment.confirmed`, `appointment.rescheduled`, `appointment.cancelled`, `customer.anonymized`) are interesting to downstream systems: CRM, marketing, billing, data warehouse. Direct publish-from-handler creates two problems:

1. **Dual write.** If the appointment commit succeeds and the publish fails (or vice versa), upstream and downstream disagree. There's no transaction across an in-process DB and an external broker.
2. **Reliability.** A flaky downstream (Kafka outage, webhook 502) blocks the user-facing request.

## Decision

**Transactional outbox pattern.** Service code writes both the appointment row AND a row to `outbox_event` in the *same transaction*. A separate worker (`OutboxPublisherService`) polls `WHERE published_at IS NULL`, claims a batch with `FOR UPDATE SKIP LOCKED`, delivers the events, and marks `published_at = now()`.

Schema:

```sql
CREATE TABLE outbox_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dealership_id   uuid NOT NULL,
  aggregate_type  text NOT NULL,
  aggregate_id    uuid NOT NULL,
  event_type      text NOT NULL,
  payload         jsonb NOT NULL,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  published_at    timestamptz NULL,
  attempt_count   int NOT NULL DEFAULT 0,
  last_error      text NULL
);
CREATE INDEX idx_outbox_unpublished ON outbox_event (occurred_at) WHERE published_at IS NULL;
```

The demo worker delivers via structured log line. Production swaps that for Kafka producer / SNS publish / webhook fan-out — one method to replace.

## Consequences

- **At-least-once delivery.** Consumers must be idempotent; we publish `aggregate_id` so they can dedup.
- **Exactly-aligned with commit.** If the appointment INSERT rolls back, the outbox row never lands. If the worker crashes mid-publish, the row stays unpublished and the next tick retries.
- **Bounded lag.** `outbox_lag_seconds` Prometheus gauge tracks `min(occurred_at)` over unpublished rows. SLO: < 30s p99.
- **Concurrency-safe with multiple workers.** `FOR UPDATE SKIP LOCKED` lets N replicas claim disjoint batches.
- Cost: the outbox table grows. Documented archival pattern (§4.6) covers cold storage; for now, a daily prune of `published_at < now() - 7 days` keeps the table small.
