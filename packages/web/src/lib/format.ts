import { DateTime } from 'luxon';

/** Postgres returns tstzrange as `["2026-05-01 13:00:00+00","2026-05-01 13:30:00+00")`. */
export function parseTimeRange(literal: string): { lower: DateTime; upper: DateTime } {
  const match = literal.match(/^[\[\(]"?([^",\]\)]+)"?,\s*"?([^",\]\)]+)"?[\]\)]$/);
  if (!match) {
    throw new Error(`Could not parse tstzrange literal: ${literal}`);
  }
  const lower = parseTstzrangeBound(match[1]!);
  const upper = parseTstzrangeBound(match[2]!);
  if (!lower.isValid || !upper.isValid) {
    // Throw — silent invalid DateTimes leak into UI as "Invalid DateTime".
    throw new Error(
      `Could not parse tstzrange bounds in "${literal}": ` +
        `lower=${lower.invalidReason ?? 'ok'}, upper=${upper.invalidReason ?? 'ok'}`,
    );
  }
  return { lower, upper };
}

/**
 * Parse one bound of a Postgres tstzrange like `2026-05-01 13:00:00+00`.
 *
 * Two normalizations happen here, both load-bearing:
 *   1. space → `T`. Postgres uses SQL-style date+space+time, but Luxon's
 *      `fromISO` is the only parser that handles arbitrary offsets cleanly,
 *      and ISO requires `T`.
 *   2. `+00` → `+00:00`. Postgres emits 2-digit offsets for whole-hour zones;
 *      ISO 8601 accepts that, but Luxon's parser is more forgiving with the
 *      explicit `:00`. Padding here makes parsing robust on every Luxon
 *      version we might pin to.
 *
 * Don't use `fromSQL` — it expects a literal space and `+0000` (no colon),
 * which is exactly what we *don't* have after step 1.
 */
function parseTstzrangeBound(raw: string): DateTime {
  const iso = raw.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00');
  return DateTime.fromISO(iso, { setZone: true });
}

export function formatRange(literal: string, zone: string): string {
  const { lower, upper } = parseTimeRange(literal);
  const l = lower.setZone(zone);
  const u = upper.setZone(zone);
  if (l.hasSame(u, 'day')) {
    return `${l.toFormat('ccc LLL d, h:mm')}–${u.toFormat('h:mm a ZZZZ')}`;
  }
  return `${l.toFormat('ccc LLL d, h:mm a')} → ${u.toFormat('ccc LLL d, h:mm a ZZZZ')}`;
}

export function formatSlot(iso: string, zone: string): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat('ccc LLL d, h:mm a');
}

export function formatDate(iso: string, zone: string): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat('ccc, LLL d yyyy');
}

/** ISO datetime input (browser <input type="datetime-local">) → ISO 8601 with offset in zone. */
export function localInputToZoned(localValue: string, zone: string): string {
  // localValue is e.g. '2026-06-01T14:00'
  const dt = DateTime.fromISO(localValue, { zone });
  return dt.toISO()!;
}

/** ISO 8601 UTC → value suitable for `<input type="datetime-local">`. */
export function isoToLocalInput(iso: string, zone: string): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat("yyyy-LL-dd'T'HH:mm");
}
