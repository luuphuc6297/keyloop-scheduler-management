import { DateTime } from 'luxon';

const TSTZRANGE_RE = /^[\[\(]"?([^",\]\)]+)"?,\s*"?([^",\]\)]+)"?[\]\)]$/;

export interface ParsedTstzrange {
  startAtIso: string;
  endAtIso: string;
}

/**
 * Parse a Postgres tstzrange literal — what TypeORM gives back when reading a
 * `tstzrange` column without explicit casting.
 *
 * Postgres formats bounds as SQL `2026-07-06 13:00:00+00`, NOT ISO
 * `2026-07-06T13:00:00.000Z`. Two normalizations are load-bearing:
 *   1. space → `T` so it parses as ISO 8601.
 *   2. `+00` (2-digit offset) → `+00:00` because Luxon's ISO parser rejects
 *      the bare 2-digit form on some versions, returning `Invalid DateTime`
 *      that silently flows into downstream comparisons.
 *
 * Don't use `new Date(...)` here — its behavior on the SQL form is engine-
 * specific and has been the source of two production bugs already (FE
 * formatRange, BE availability overlap check).
 */
export function parseTstzrange(literal: string): ParsedTstzrange {
  const match = TSTZRANGE_RE.exec(literal);
  if (!match) {
    throw new Error(`Could not parse tstzrange literal: ${literal}`);
  }
  return {
    startAtIso: parseBound(match[1]!),
    endAtIso: parseBound(match[2]!),
  };
}

function parseBound(raw: string): string {
  const normalized = raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  const dt = DateTime.fromISO(normalized, { setZone: true });
  if (!dt.isValid) {
    throw new Error(`Could not parse tstzrange bound "${raw}": ${dt.invalidReason ?? 'invalid'}`);
  }
  return dt.toUTC().toISO()!;
}

/**
 * Returns the raw lower-bound string from the literal — useful as an opaque
 * pagination cursor where the value goes back into Postgres via `$::timestamptz`
 * (which accepts the SQL form natively, unlike JS Date constructors).
 */
export function extractLowerBound(literal: string): string {
  const match = TSTZRANGE_RE.exec(literal);
  if (!match) {
    throw new Error(`Could not parse tstzrange literal: ${literal}`);
  }
  return match[1]!;
}
