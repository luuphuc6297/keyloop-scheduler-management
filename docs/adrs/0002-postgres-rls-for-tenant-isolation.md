# ADR-0002 — Postgres RLS for tenant isolation

**Status:** Accepted
**Date:** 2026-04-28

## Context

The scheduler is multi-tenant. Every dealership's data must be invisible to every other dealership. Two general strategies were considered:

1. **Application-layer scoping.** Every query in every service explicitly adds `WHERE dealership_id = $1`. Relies on developer discipline; one missing predicate is a cross-tenant data leak.
2. **Database-layer Row Level Security (RLS).** Postgres `ENABLE ROW LEVEL SECURITY` + a tenant policy that reads a session-local GUC (`app.current_dealership`). The database refuses to return rows that don't match.

The team has prior experience with both. Application-layer scoping has produced cross-tenant leaks in past projects when a junior dev ships a `SELECT` that forgets the tenant filter. Postgres RLS has not.

## Decision

We use Postgres RLS with `FORCE ROW LEVEL SECURITY` so even table owners are filtered. Every multi-tenant table gets a policy of the form:

```sql
CREATE POLICY tenant_isolation ON <table>
  USING       (dealership_id::text = current_setting('app.current_dealership', true))
  WITH CHECK  (dealership_id::text = current_setting('app.current_dealership', true));
```

The runtime app uses the `scheduler_app` role (no BYPASSRLS). The GUC is set at the start of every transaction via the helper `applyRlsContext(manager, ctx)` from `shared/db/rls-context.ts`. Migrations and seed scripts run as `scheduler_migrator` (BYPASSRLS).

## Consequences

- A missing GUC fails closed: queries return zero rows. Tests catch this in CI before it ships.
- Every service-level transaction must call `applyRlsContext()` as its first statement. We tried wiring this as a global NestInterceptor; that fails because `set_config(..., true)` is transaction-local and Nest's interceptor opens a different connection from the service-level `ds.transaction()`. The helper-based approach works because the service's own transaction sets the GUC.
- We pay one extra round-trip per request (`set_config` calls). Measured at <1ms p99 in the soak test; acceptable.
- Future option: adopt `typeorm-transactional` (already in deps) to share async-context and revisit the global interceptor pattern. Captured in ADR-0009.
