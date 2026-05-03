/**
 * TypeORM (v0.3.x) wraps the result of `manager.query('UPDATE ... RETURNING *')`
 * as a `[rows[], rowCount]` tuple instead of returning rows directly the way
 * SELECT and INSERT do. See PostgresQueryRunner: the switch on `raw.command`
 * produces `result.raw = [raw.rows, raw.rowCount]` for `UPDATE` and `DELETE`.
 *
 * Forgetting this and reading `result[0]` as a row instead of the rows array
 * silently feeds an array (or `undefined`) into downstream `toResponse(row)`
 * calls — every property comes back `undefined`, JSON.stringify drops them all,
 * and the next INSERT crashes on a NOT NULL constraint with a `null` foreign
 * key. This helper unwraps both shapes so callers can stop caring.
 *
 * The narrow shape check (Array.isArray of the first element) handles older
 * TypeORM versions and any future change that flattens the response — it'd
 * false-positive only if a row itself happened to be an array, which never
 * happens for SQL row results.
 */
export function unwrapUpdateRows<TRow>(raw: unknown): TRow[] {
  if (!Array.isArray(raw)) return [];
  if (raw.length === 0) return [];
  // TypeORM 0.3.x UPDATE/DELETE shape: [rowsArray, affectedRowCount].
  if (Array.isArray(raw[0])) {
    return raw[0] as TRow[];
  }
  // Older / non-wrapped shape: rowsArray directly.
  return raw as TRow[];
}
