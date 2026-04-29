import { DateTime } from 'luxon';

/**
 * Thrown when a customer's requested local time does not exist in the dealership's
 * timezone (DST spring-forward gap) or maps to a moved-back time (fall-back overlap).
 * Reference: design doc Section 8.2.
 */
export class InvalidLocalTimeError extends Error {
  constructor(readonly explanation: string) {
    super(`Invalid local time: ${explanation}`);
    this.name = 'InvalidLocalTimeError';
  }
}

export interface ComputeTimeRangeParams {
  /** ISO 8601 start time (with timezone offset, e.g. `2026-05-01T09:15:00-04:00`). */
  startAt: string;
  /** Service duration in minutes (from service_type.duration_minutes). */
  durationMinutes: number;
  /** Post-service buffer in minutes (cleanup, paperwork). */
  bufferMinutes: number;
  /** Dealership IANA timezone (e.g. `America/New_York`). */
  timezone: string;
}

/**
 * Compute a Postgres `tstzrange` literal `[<lower>,<upper>)` for an appointment.
 * Uses Luxon to validate against DST transitions:
 *   - Spring-forward non-existent times are rejected.
 *   - Fall-back ambiguous times resolve to the earlier UTC offset (Luxon default).
 *
 * Reference: design doc Section 8.
 */
export function computeTimeRange(params: ComputeTimeRangeParams): string {
  const { startAt, durationMinutes, bufferMinutes, timezone } = params;

  if (durationMinutes <= 0) {
    throw new InvalidLocalTimeError('durationMinutes must be positive');
  }
  if (bufferMinutes < 0) {
    throw new InvalidLocalTimeError('bufferMinutes must be non-negative');
  }

  // Validate ISO format up front.
  const parsed = DateTime.fromISO(startAt, { setZone: true });
  if (!parsed.isValid) {
    throw new InvalidLocalTimeError(parsed.invalidExplanation ?? 'unparseable start_at');
  }

  // Extract wall-clock components from the ISO string and reinterpret them in the
  // dealership's IANA timezone.
  //
  // DST gap detection: Luxon does NOT mark invalid for non-existent local times
  // (e.g. 02:30 on a spring-forward day) — it silently shifts forward to the next
  // valid instant. We detect the gap by comparing the resulting wall-clock fields
  // against the input. If they differ, Luxon shifted us forward, which means the
  // requested local time did not exist in that zone.
  const match = startAt.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) {
    throw new InvalidLocalTimeError(`could not parse wall-clock components from ${startAt}`);
  }
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr] = match;
  const wallClock = {
    year: Number(yearStr),
    month: Number(monthStr),
    day: Number(dayStr),
    hour: Number(hourStr),
    minute: Number(minuteStr),
    second: Number(secondStr ?? '0'),
  };
  const inDealershipTz = DateTime.fromObject(wallClock, { zone: timezone });
  if (!inDealershipTz.isValid) {
    throw new InvalidLocalTimeError(
      `local time ${startAt} is invalid in ${timezone}: ${inDealershipTz.invalidExplanation ?? 'invalid'}`,
    );
  }
  if (
    inDealershipTz.year !== wallClock.year ||
    inDealershipTz.month !== wallClock.month ||
    inDealershipTz.day !== wallClock.day ||
    inDealershipTz.hour !== wallClock.hour ||
    inDealershipTz.minute !== wallClock.minute
  ) {
    throw new InvalidLocalTimeError(
      `local time ${startAt} does not exist in ${timezone} (DST spring-forward gap)`,
    );
  }

  const end = inDealershipTz.plus({ minutes: durationMinutes + bufferMinutes });

  // Postgres tstzrange literal: half-open [lower, upper).
  return `[${inDealershipTz.toUTC().toISO()},${end.toUTC().toISO()})`;
}
