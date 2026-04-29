import { DateTime } from 'luxon';

/** Postgres returns tstzrange as `["2026-05-01 13:00:00+00","2026-05-01 13:30:00+00")`. */
export function parseTimeRange(literal: string): { lower: DateTime; upper: DateTime } {
  const match = literal.match(/^[\[\(]"?([^",\]\)]+)"?,\s*"?([^",\]\)]+)"?[\]\)]$/);
  if (!match) {
    throw new Error(`Could not parse tstzrange literal: ${literal}`);
  }
  const lower = DateTime.fromSQL(match[1]!.replace(' ', 'T'), { zone: 'utc' });
  const upper = DateTime.fromSQL(match[2]!.replace(' ', 'T'), { zone: 'utc' });
  return { lower, upper };
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
