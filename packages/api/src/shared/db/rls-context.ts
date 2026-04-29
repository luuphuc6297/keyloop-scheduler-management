import type { EntityManager } from 'typeorm';

export interface RlsTenantContext {
  dealershipId: string;
  userId: string;
  /** Optional request id; useful for audit triggers / correlation. */
  requestId?: string;
}

/**
 * Apply tenant + user context to the current Postgres transaction so RLS
 * policies (`current_setting('app.current_dealership')`, etc.) resolve
 * correctly. Must be called as the first statement of every service-level
 * `ds.transaction(...)` block that touches RLS-protected tables.
 *
 * Why we use a helper instead of a global NestInterceptor:
 *   - `set_config(..., true)` is transaction-local. Setting it in an outer
 *     interceptor transaction does not propagate to the nested transactions
 *     services open via `ds.transaction(...)` because TypeORM checks out a
 *     different connection from the pool.
 *   - The library `typeorm-transactional` (already in deps) would solve this
 *     via AsyncLocalStorage, but adopting it requires refactoring every
 *     service-level `ds.transaction(...)` to its `@Transactional()` decorator.
 *     That's a larger change than the demo budget allows.
 *   - Keeping the helper as the single source of truth means tests and CLI
 *     scripts (which don't run through the interceptor) get RLS context too.
 *
 * Reference: design doc §7.5 + §7.6 + ADR 0002.
 */
export async function applyRlsContext(
  manager: EntityManager,
  ctx: RlsTenantContext,
): Promise<void> {
  await manager.query(`SELECT set_config('app.current_dealership', $1, true)`, [ctx.dealershipId]);
  await manager.query(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.userId]);
  if (ctx.requestId) {
    await manager.query(`SELECT set_config('app.current_request_id', $1, true)`, [ctx.requestId]);
  }
}
