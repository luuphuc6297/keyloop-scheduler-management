/**
 * RLS Context Interceptor — INTENTIONALLY NOT IMPLEMENTED.
 *
 * An earlier draft of this file shipped a global NestInterceptor that wrapped
 * every authenticated request in a Postgres transaction with `set_config(...)`
 * for `app.current_dealership` / `app.current_user_id`. That approach DOES NOT
 * work without async-context propagation:
 *
 *   - `set_config(..., true)` is transaction-local. The interceptor's outer
 *     transaction holds the GUC, but the services it wraps each call
 *     `ds.transaction(...)` which checks out a different connection from the
 *     pool. The GUC does not propagate, so RLS policies in the inner tx see
 *     `app.current_dealership = ''` and reject every query.
 *   - The library `typeorm-transactional` (already in deps but uninitialized)
 *     could solve this via AsyncLocalStorage. Adopting it would require
 *     replacing every service-level `ds.transaction(...)` with the library's
 *     `@Transactional()` decorator. That's a multi-day refactor and is queued
 *     in ADR 0009 as future work.
 *
 * Until then, the canonical mechanism for setting RLS context is
 * `applyRlsContext(manager, ctx)` from `shared/db/rls-context.ts`, called as
 * the first statement of every service-level transaction. Each service has a
 * thin private `setRlsContext(manager, ctx)` method that delegates to the
 * helper, keeping call sites short and the implementation in one place.
 *
 * Reference: design doc §7.6, ADR 0002 (RLS strategy), ADR 0009 (typeorm-transactional adoption).
 */
export {};
