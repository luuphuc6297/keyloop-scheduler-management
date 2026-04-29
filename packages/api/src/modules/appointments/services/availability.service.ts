import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
import { applyRlsContext } from '../../../shared/db/rls-context';
import { MetricsService } from '../../observability/metrics.service';
import type { AvailabilityQuery, AvailabilitySlot } from '../dtos/availability.schema';

interface BookContext {
  userId: string;
  dealershipId: string;
}

interface ServiceTypeRow {
  id: string;
  duration_minutes: number;
  buffer_minutes: number;
  required_skill_id: string | null;
}

interface BookedRange {
  technician_id: string;
  lower: string;
  upper: string;
}

interface TechnicianRow {
  id: string;
}

interface BusinessHoursRow {
  day_of_week: number;
  open_time: string;
  close_time: string;
}

interface BusinessHoursExceptionRow {
  date: string;
  is_closed: boolean;
  override_open: string | null;
  override_close: string | null;
}

interface TechnicianShiftRow {
  technician_id: string;
  day_of_week: number;
  shift_start: string;
  shift_end: string;
}

interface TechnicianTimeOffRow {
  technician_id: string;
  date_lower: string;
  date_upper: string; // exclusive
}

const SLOT_GRANULARITY_MIN = 30;

interface DayWindow {
  start: DateTime;
  end: DateTime;
}

/**
 * Returns free 30-min slot starts in `[from, to)` for the given service type.
 *
 * The available time for a (technician, day) is the intersection of:
 *   - Dealership business hours for that day-of-week
 *     (overridden by `business_hours_exception` rows; `is_closed` zeroes the day)
 *   - Technician shift for that day-of-week
 *
 * From which we subtract:
 *   - Technician time-off (full-day blocks)
 *   - Confirmed bookings overlapping the day
 *
 * The candidate grid is 30-min aligned. A slot is offered when [start, start+duration+buffer)
 * fits entirely inside the available time AND does not overlap any subtracted range.
 *
 * Reference: design doc §5.5 + Appendix B.
 */
@Injectable()
export class AvailabilityService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  async findSlots(query: AvailabilityQuery, ctx: BookContext): Promise<AvailabilitySlot[]> {
    const stop = this.metrics.availabilityQueryDuration.startTimer();
    try {
      return await this.findSlotsInner(query, ctx);
    } finally {
      stop();
    }
  }

  private async findSlotsInner(
    query: AvailabilityQuery,
    ctx: BookContext,
  ): Promise<AvailabilitySlot[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);

      const service = await this.loadServiceType(manager, query.service_type_id);
      const totalMin = service.duration_minutes + service.buffer_minutes;

      const dealership = (await manager.query(`SELECT timezone FROM dealership WHERE id = $1`, [
        ctx.dealershipId,
      ])) as Array<{ timezone: string }>;
      if (dealership.length === 0) throw new NotFoundException({ code: 'DEALERSHIP_NOT_FOUND' });
      const tz = dealership[0]!.timezone;

      const technicians = await this.resolveTechnicians(
        manager,
        ctx.dealershipId,
        query.technician_id,
        service.required_skill_id,
      );
      if (technicians.length === 0) return [];

      const techIds = technicians.map((t) => t.id);

      const [hours, exceptions, shifts, timeOff, booked] = await Promise.all([
        this.loadBusinessHours(manager, ctx.dealershipId),
        this.loadBusinessHoursExceptions(manager, ctx.dealershipId, query.from, query.to),
        this.loadTechnicianShifts(manager, techIds),
        this.loadTechnicianTimeOff(manager, techIds, query.from, query.to),
        this.loadBookings(manager, techIds, query.from, query.to),
      ]);

      const exceptionsByDate = new Map(exceptions.map((e) => [e.date, e]));
      const hoursByDow = new Map(hours.map((h) => [h.day_of_week, h]));
      const shiftsByTechDow = new Map<string, TechnicianShiftRow>();
      for (const s of shifts) shiftsByTechDow.set(`${s.technician_id}:${s.day_of_week}`, s);
      const timeOffByTech = new Map<string, TechnicianTimeOffRow[]>();
      for (const t of timeOff) {
        const arr = timeOffByTech.get(t.technician_id) ?? [];
        arr.push(t);
        timeOffByTech.set(t.technician_id, arr);
      }
      const bookedByTech = new Map<string, BookedRange[]>();
      for (const b of booked) {
        const arr = bookedByTech.get(b.technician_id) ?? [];
        arr.push(b);
        bookedByTech.set(b.technician_id, arr);
      }

      const fromDt = DateTime.fromISO(query.from, { setZone: true });
      const toDt = DateTime.fromISO(query.to, { setZone: true });

      const slots: AvailabilitySlot[] = [];

      for (const tech of technicians) {
        let dayCursor = fromDt.setZone(tz).startOf('day');
        const lastDay = toDt.setZone(tz).startOf('day');
        while (dayCursor <= lastDay) {
          const dayWindows = this.computeAvailableWindows(
            dayCursor,
            tz,
            tech.id,
            hoursByDow,
            exceptionsByDate,
            shiftsByTechDow,
            timeOffByTech,
          );
          for (const win of dayWindows) {
            this.emitSlots(
              slots,
              win,
              fromDt,
              toDt,
              totalMin,
              tech.id,
              query.bay_id ?? null,
              bookedByTech.get(tech.id) ?? [],
            );
          }
          dayCursor = dayCursor.plus({ days: 1 });
        }
      }

      // Sort slots chronologically; deterministic ordering helps consumers
      slots.sort((a, b) => (a.start_at < b.start_at ? -1 : a.start_at > b.start_at ? 1 : 0));
      return slots;
    });
  }

  // ===== loaders =====

  private async setRlsContext(manager: EntityManager, ctx: BookContext): Promise<void> {
    await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
  }

  private async loadServiceType(manager: EntityManager, id: string): Promise<ServiceTypeRow> {
    const rows = (await manager.query(
      `SELECT id, duration_minutes, buffer_minutes, required_skill_id
         FROM service_type WHERE id = $1`,
      [id],
    )) as ServiceTypeRow[];
    if (rows.length === 0) throw new NotFoundException({ code: 'SERVICE_TYPE_NOT_FOUND' });
    return rows[0]!;
  }

  private async resolveTechnicians(
    manager: EntityManager,
    dealershipId: string,
    technicianId: string | undefined,
    requiredSkillId: string | null,
  ): Promise<TechnicianRow[]> {
    if (technicianId) {
      const rows = (await manager.query(
        `SELECT id FROM technician WHERE id = $1 AND dealership_id = $2 AND is_active`,
        [technicianId, dealershipId],
      )) as TechnicianRow[];
      return rows;
    }
    if (requiredSkillId) {
      return (await manager.query(
        `SELECT t.id
           FROM technician t
           JOIN technician_skill ts ON ts.technician_id = t.id
          WHERE t.dealership_id = $1 AND t.is_active AND ts.skill_id = $2`,
        [dealershipId, requiredSkillId],
      )) as TechnicianRow[];
    }
    return (await manager.query(
      `SELECT id FROM technician WHERE dealership_id = $1 AND is_active`,
      [dealershipId],
    )) as TechnicianRow[];
  }

  private async loadBusinessHours(
    manager: EntityManager,
    dealershipId: string,
  ): Promise<BusinessHoursRow[]> {
    return (await manager.query(
      `SELECT day_of_week, open_time::text AS open_time, close_time::text AS close_time
         FROM business_hours WHERE dealership_id = $1`,
      [dealershipId],
    )) as BusinessHoursRow[];
  }

  private async loadBusinessHoursExceptions(
    manager: EntityManager,
    dealershipId: string,
    from: string,
    to: string,
  ): Promise<BusinessHoursExceptionRow[]> {
    return (await manager.query(
      `SELECT date::text AS date, is_closed,
              override_open::text AS override_open,
              override_close::text AS override_close
         FROM business_hours_exception
        WHERE dealership_id = $1 AND date BETWEEN $2::timestamptz::date AND $3::timestamptz::date`,
      [dealershipId, from, to],
    )) as BusinessHoursExceptionRow[];
  }

  private async loadTechnicianShifts(
    manager: EntityManager,
    technicianIds: string[],
  ): Promise<TechnicianShiftRow[]> {
    if (technicianIds.length === 0) return [];
    return (await manager.query(
      `SELECT technician_id, day_of_week,
              shift_start::text AS shift_start,
              shift_end::text AS shift_end
         FROM technician_shift WHERE technician_id = ANY($1::uuid[])`,
      [technicianIds],
    )) as TechnicianShiftRow[];
  }

  private async loadTechnicianTimeOff(
    manager: EntityManager,
    technicianIds: string[],
    from: string,
    to: string,
  ): Promise<TechnicianTimeOffRow[]> {
    if (technicianIds.length === 0) return [];
    return (await manager.query(
      `SELECT technician_id,
              lower(date_range)::text AS date_lower,
              upper(date_range)::text AS date_upper
         FROM technician_time_off
        WHERE technician_id = ANY($1::uuid[])
          AND date_range && daterange($2::timestamptz::date, $3::timestamptz::date, '[)')`,
      [technicianIds, from, to],
    )) as TechnicianTimeOffRow[];
  }

  private async loadBookings(
    manager: EntityManager,
    technicianIds: string[],
    from: string,
    to: string,
  ): Promise<BookedRange[]> {
    if (technicianIds.length === 0) return [];
    return (await manager.query(
      `SELECT technician_id,
              lower(time_range)::text AS lower,
              upper(time_range)::text AS upper
         FROM appointment
        WHERE technician_id = ANY($1::uuid[])
          AND status = 'confirmed'
          AND time_range && tstzrange($2::timestamptz, $3::timestamptz, '[)')`,
      [technicianIds, from, to],
    )) as BookedRange[];
  }

  // ===== windowing =====

  /**
   * Compute the intersection windows for one (technician, day) pair given:
   *   - business hours (or override_open/close from exception, or 0 if closed)
   *   - technician shift for that day-of-week
   *   - technician time-off (full-day, knocks the entire day out)
   */
  private computeAvailableWindows(
    day: DateTime,
    tz: string,
    technicianId: string,
    hoursByDow: Map<number, BusinessHoursRow>,
    exceptionsByDate: Map<string, BusinessHoursExceptionRow>,
    shiftsByTechDow: Map<string, TechnicianShiftRow>,
    timeOffByTech: Map<string, TechnicianTimeOffRow[]>,
  ): DayWindow[] {
    const localDate = day.toFormat('yyyy-LL-dd');
    const dow = day.weekday % 7;

    // Time-off check
    const offs = timeOffByTech.get(technicianId) ?? [];
    for (const o of offs) {
      if (localDate >= o.date_lower && localDate < o.date_upper) return [];
    }

    // Determine open/close for the day
    let openTime: string | null = null;
    let closeTime: string | null = null;
    const exception = exceptionsByDate.get(localDate);
    if (exception) {
      if (exception.is_closed) return [];
      openTime = exception.override_open;
      closeTime = exception.override_close;
    } else {
      const baseHours = hoursByDow.get(dow);
      if (!baseHours) return []; // dealership closed for this day-of-week
      openTime = baseHours.open_time;
      closeTime = baseHours.close_time;
    }
    if (!openTime || !closeTime) return [];

    // Shift for this technician + day
    const shift = shiftsByTechDow.get(`${technicianId}:${dow}`);
    if (!shift) return [];

    const dayOpen = DateTime.fromISO(`${localDate}T${openTime}`, { zone: tz });
    const dayClose = DateTime.fromISO(`${localDate}T${closeTime}`, { zone: tz });
    const shiftStart = DateTime.fromISO(`${localDate}T${shift.shift_start}`, { zone: tz });
    const shiftEnd = DateTime.fromISO(`${localDate}T${shift.shift_end}`, { zone: tz });

    const start = dayOpen > shiftStart ? dayOpen : shiftStart;
    const end = dayClose < shiftEnd ? dayClose : shiftEnd;
    if (end <= start) return [];

    return [{ start, end }];
  }

  /**
   * Walk a 30-min grid inside `window`, emitting slots that fit `totalMin` and
   * don't collide with confirmed bookings. Slots outside `[from, to)` are dropped.
   */
  private emitSlots(
    out: AvailabilitySlot[],
    window: DayWindow,
    rangeFrom: DateTime,
    rangeTo: DateTime,
    totalMin: number,
    technicianId: string,
    bayId: string | null,
    bookings: BookedRange[],
  ): void {
    let cursor = alignToGrid(window.start);
    while (cursor.plus({ minutes: totalMin }) <= window.end) {
      const slotStart = cursor;
      const slotEnd = slotStart.plus({ minutes: totalMin });

      // Honor caller's [from, to) boundary
      if (slotStart < rangeFrom || slotEnd > rangeTo) {
        cursor = cursor.plus({ minutes: SLOT_GRANULARITY_MIN });
        continue;
      }

      const overlaps = bookings.some((b) => {
        const bLower = DateTime.fromISO(b.lower, { setZone: true });
        const bUpper = DateTime.fromISO(b.upper, { setZone: true });
        return slotStart < bUpper && slotEnd > bLower;
      });
      if (!overlaps) {
        out.push({
          start_at: slotStart.toUTC().toISO()!,
          end_at: slotEnd.toUTC().toISO()!,
          technician_id: technicianId,
          bay_id: bayId,
        });
      }
      cursor = cursor.plus({ minutes: SLOT_GRANULARITY_MIN });
    }
  }
}

function alignToGrid(dt: DateTime): DateTime {
  const minute = dt.minute;
  const remainder = minute % SLOT_GRANULARITY_MIN;
  if (remainder === 0 && dt.second === 0 && dt.millisecond === 0) return dt;
  return dt
    .set({ minute: minute - remainder, second: 0, millisecond: 0 })
    .plus({ minutes: SLOT_GRANULARITY_MIN });
}
