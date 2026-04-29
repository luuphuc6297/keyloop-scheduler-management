import { DateTime } from 'luxon';
import type { EntityManager } from 'typeorm';

/**
 * Domain validators for booking. Each validator throws a structured error with
 * a stable error code (matching the spec §5.2 enum). Invoked from
 * AppointmentsService.book() and reschedule(), inside the transaction so RLS
 * context is honored.
 *
 * Validation order is intentional:
 *   1. DST safety  (cheap, in-memory)
 *   2. Skill match (one row lookup)
 *   3. Business hours / closed exception (one query)
 *   4. Technician shift / time-off (two queries)
 *
 * Reference: design doc §5.4 (validators block) + §8.3 (cross-DST walk).
 */

export class BookingValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'BookingValidationError';
  }
}

export interface ValidationContext {
  manager: EntityManager;
  dealershipId: string;
  timezone: string;
  /** UTC ISO of appointment start. */
  startAtIso: string;
  /** UTC ISO of appointment end (start + duration + buffer). */
  endAtIso: string;
}

/**
 * §8.3 — walks a tstzrange in 30-min steps and ensures every wall-clock
 * timestamp on the way maps to a real local instant in `tz`. Catches the rare
 * case where an appointment straddles a spring-forward gap (e.g. starts at
 * 01:30 EST and runs through 02:30 EST which doesn't exist).
 */
export function validateRangeDoesNotCrossUnsafeDstTransition(
  startAtIso: string,
  endAtIso: string,
  tz: string,
): void {
  const start = DateTime.fromISO(startAtIso, { setZone: true });
  const end = DateTime.fromISO(endAtIso, { setZone: true });
  const startInTz = start.setZone(tz);
  const endInTz = end.setZone(tz);
  if (startInTz.offset === endInTz.offset) return; // same offset → safe

  let cursor = start;
  while (cursor < end) {
    const localStr = cursor.setZone(tz).toISO();
    if (!localStr) {
      throw new BookingValidationError(
        'INVALID_LOCAL_TIME',
        'Appointment range crosses a DST transition that produces an invalid local time',
        { at: cursor.toISO() },
      );
    }
    const back = DateTime.fromISO(localStr, { zone: tz });
    if (back.toMillis() !== cursor.toMillis()) {
      throw new BookingValidationError(
        'INVALID_LOCAL_TIME',
        'Appointment range crosses a DST gap (a 30-min step does not map to a real local time)',
        { at: cursor.toISO() },
      );
    }
    cursor = cursor.plus({ minutes: 30 });
  }
}

/**
 * §5.4 — technician must possess the skill required by the service type
 * (only enforced when `service_type.required_skill_id` is non-null).
 */
export async function validateSkillMatch(
  ctx: ValidationContext,
  technicianId: string,
  requiredSkillId: string | null,
): Promise<void> {
  if (!requiredSkillId) return;
  const rows = (await ctx.manager.query(
    `SELECT 1 FROM technician_skill
      WHERE technician_id = $1 AND skill_id = $2 LIMIT 1`,
    [technicianId, requiredSkillId],
  )) as Array<{ '?column?': number }>;
  if (rows.length === 0) {
    throw new BookingValidationError(
      'TECHNICIAN_LACKS_SKILL',
      'Selected technician does not possess the required skill for this service',
      { technician_id: technicianId, required_skill_id: requiredSkillId },
    );
  }
}

/**
 * §5.4 — appointment must fit within the dealership's business hours for the
 * day(s) it covers. business_hours_exception with `is_closed=true` triggers a
 * `DEALERSHIP_CLOSED` error. Override hours from the exception take precedence.
 */
export async function validateBusinessHours(ctx: ValidationContext): Promise<void> {
  const start = DateTime.fromISO(ctx.startAtIso, { setZone: true }).setZone(ctx.timezone);
  const end = DateTime.fromISO(ctx.endAtIso, { setZone: true }).setZone(ctx.timezone);

  // Walk every day the appointment touches (usually 1, occasionally 2 if it
  // straddles midnight). For each day check exception → business_hours.
  let day = start.startOf('day');
  while (day < end) {
    const localDate = day.toFormat('yyyy-LL-dd');
    const dow = day.weekday % 7; // luxon: 1=Mon..7=Sun → spec uses 0=Sun..6=Sat

    const exceptions = (await ctx.manager.query(
      `SELECT is_closed,
              override_open::text AS override_open,
              override_close::text AS override_close
         FROM business_hours_exception
        WHERE dealership_id = $1 AND date = $2`,
      [ctx.dealershipId, localDate],
    )) as Array<{ is_closed: boolean; override_open: string | null; override_close: string | null }>;

    let openTime: string | null;
    let closeTime: string | null;

    if (exceptions.length > 0) {
      const ex = exceptions[0]!;
      if (ex.is_closed) {
        throw new BookingValidationError('DEALERSHIP_CLOSED', `Dealership is closed on ${localDate}`, {
          date: localDate,
        });
      }
      openTime = ex.override_open;
      closeTime = ex.override_close;
    } else {
      const hours = (await ctx.manager.query(
        `SELECT open_time::text AS open_time, close_time::text AS close_time
           FROM business_hours
          WHERE dealership_id = $1 AND day_of_week = $2`,
        [ctx.dealershipId, dow],
      )) as Array<{ open_time: string; close_time: string }>;
      if (hours.length === 0) {
        throw new BookingValidationError(
          'DEALERSHIP_CLOSED',
          `Dealership has no business hours configured for day-of-week ${dow}`,
          { date: localDate, day_of_week: dow },
        );
      }
      openTime = hours[0]!.open_time;
      closeTime = hours[0]!.close_time;
    }

    if (!openTime || !closeTime) {
      throw new BookingValidationError(
        'OUTSIDE_BUSINESS_HOURS',
        `Business hours unresolved for ${localDate}`,
        { date: localDate },
      );
    }

    // Compute the day's open/close DateTimes in the dealership tz
    const dayOpen = DateTime.fromISO(`${localDate}T${openTime}`, { zone: ctx.timezone });
    const dayClose = DateTime.fromISO(`${localDate}T${closeTime}`, { zone: ctx.timezone });

    // Slice of the appointment that falls on this day
    const sliceStart = day < start ? start : day;
    const dayEnd = day.plus({ days: 1 });
    const sliceEnd = end < dayEnd ? end : dayEnd;

    if (sliceStart < dayOpen || sliceEnd > dayClose) {
      throw new BookingValidationError(
        'OUTSIDE_BUSINESS_HOURS',
        `Appointment is outside business hours (${openTime}–${closeTime}) on ${localDate}`,
        { date: localDate, open: openTime, close: closeTime },
      );
    }

    day = day.plus({ days: 1 });
  }
}

/**
 * §5.4 — technician must be on shift across the entire appointment range and
 * not have an approved time_off record overlapping the date.
 */
export async function validateTechnicianAvailability(
  ctx: ValidationContext,
  technicianId: string,
): Promise<void> {
  const start = DateTime.fromISO(ctx.startAtIso, { setZone: true }).setZone(ctx.timezone);
  const end = DateTime.fromISO(ctx.endAtIso, { setZone: true }).setZone(ctx.timezone);

  // Walk each day the appointment touches
  let day = start.startOf('day');
  while (day < end) {
    const localDate = day.toFormat('yyyy-LL-dd');
    const dow = day.weekday % 7;

    // Time-off check (date_range is a daterange — half-open, [from,to))
    const timeOff = (await ctx.manager.query(
      `SELECT 1 FROM technician_time_off
        WHERE technician_id = $1 AND date_range @> $2::date LIMIT 1`,
      [technicianId, localDate],
    )) as unknown[];
    if (timeOff.length > 0) {
      throw new BookingValidationError(
        'TECHNICIAN_OFF_SHIFT',
        `Technician is on approved time-off on ${localDate}`,
        { technician_id: technicianId, date: localDate },
      );
    }

    // Shift check
    const shifts = (await ctx.manager.query(
      `SELECT shift_start::text AS shift_start, shift_end::text AS shift_end
         FROM technician_shift
        WHERE technician_id = $1 AND day_of_week = $2`,
      [technicianId, dow],
    )) as Array<{ shift_start: string; shift_end: string }>;
    if (shifts.length === 0) {
      throw new BookingValidationError(
        'TECHNICIAN_OFF_SHIFT',
        `Technician has no shift configured for day-of-week ${dow}`,
        { technician_id: technicianId, date: localDate, day_of_week: dow },
      );
    }
    const sh = shifts[0]!;
    const shiftStart = DateTime.fromISO(`${localDate}T${sh.shift_start}`, { zone: ctx.timezone });
    const shiftEnd = DateTime.fromISO(`${localDate}T${sh.shift_end}`, { zone: ctx.timezone });

    const sliceStart = day < start ? start : day;
    const dayEnd = day.plus({ days: 1 });
    const sliceEnd = end < dayEnd ? end : dayEnd;

    if (sliceStart < shiftStart || sliceEnd > shiftEnd) {
      throw new BookingValidationError(
        'TECHNICIAN_OFF_SHIFT',
        `Appointment falls outside the technician's shift (${sh.shift_start}–${sh.shift_end}) on ${localDate}`,
        {
          technician_id: technicianId,
          date: localDate,
          shift_start: sh.shift_start,
          shift_end: sh.shift_end,
        },
      );
    }

    day = day.plus({ days: 1 });
  }
}
