import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { applyRlsContext } from '../../../shared/db/rls-context';
import { MetricsService } from '../../observability/metrics.service';
import {
  computeTimeRange,
  InvalidLocalTimeError,
  type ComputedTimeRange,
} from '../domain/compute-time-range';
import {
  BookingValidationError,
  validateBusinessHours,
  validateRangeDoesNotCrossUnsafeDstTransition,
  validateSkillMatch,
  validateTechnicianAvailability,
} from '../domain/validators';
import type { AppointmentResponse, BookAppointmentDto } from '../dtos/book-appointment.schema';
import {
  decodeCursor,
  encodeCursor,
  type ListAppointmentsQuery,
} from '../dtos/list-appointments.schema';
import type { RescheduleAppointmentDto } from '../dtos/reschedule-appointment.schema';

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

interface DealershipRow {
  id: string;
  timezone: string;
}

interface AppointmentRow {
  id: string;
  dealership_id: string;
  customer_id: string;
  vehicle_id: string;
  service_type_id: string;
  technician_id: string;
  bay_id: string;
  time_range: string;
  status: string;
  version: number;
  created_at: Date;
  updated_at: Date;
}

export interface ListResult {
  data: AppointmentResponse[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface AppointmentHistoryRow {
  id: string;
  field: string;
  old_value: unknown;
  new_value: unknown;
  changed_by: string;
  changed_at: string;
  reason: string | null;
}

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  // ===== CREATE =====

  async book(dto: BookAppointmentDto, ctx: BookContext): Promise<AppointmentResponse> {
    const stop = this.metrics.bookingDuration.startTimer();
    try {
      return await this.bookInner(dto, ctx);
    } finally {
      stop();
    }
  }

  private async bookInner(dto: BookAppointmentDto, ctx: BookContext): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);

      const dealership = await this.loadDealership(manager, ctx.dealershipId);
      const service = await this.loadServiceType(manager, dto.service_type_id);
      const range = this.buildTimeRange(dto.start_at, service, dealership.timezone);

      await this.runBookingValidators(
        manager,
        range,
        ctx.dealershipId,
        dealership.timezone,
        dto.technician_id,
        service.required_skill_id,
      );

      try {
        const inserted = (await manager.query(
          `INSERT INTO appointment
            (dealership_id, customer_id, vehicle_id, service_type_id,
             technician_id, bay_id, time_range, status, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7::tstzrange, 'confirmed', $8)
           RETURNING *`,
          [
            ctx.dealershipId,
            dto.customer_id,
            dto.vehicle_id,
            dto.service_type_id,
            dto.technician_id,
            dto.bay_id,
            range.literal,
            ctx.userId,
          ],
        )) as AppointmentRow[];

        const row = inserted[0];
        if (!row) throw new Error('No row returned from INSERT');

        await this.recordHistory(manager, row, ctx, 'created', null, toResponse(row));
        await this.publishOutbox(manager, row, ctx, 'appointment.confirmed');

        this.metrics.appointmentsCreatedTotal.labels({ dealership_id: ctx.dealershipId }).inc();
        this.logger.log(`appointment.booked id=${row.id} dealership=${ctx.dealershipId}`);
        return toResponse(row);
      } catch (err) {
        throw this.translateDbError(err);
      }
    });
  }

  // ===== READ =====

  async findById(id: string, ctx: BookContext): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      const row = await this.loadAppointment(manager, id);
      return toResponse(row);
    });
  }

  async list(query: ListAppointmentsQuery, ctx: BookContext): Promise<ListResult> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);

      const wheres: string[] = ['dealership_id = $1'];
      const params: unknown[] = [ctx.dealershipId];

      if (query.status) {
        params.push(query.status);
        wheres.push(`status = $${params.length}`);
      }
      if (query.technician_id) {
        params.push(query.technician_id);
        wheres.push(`technician_id = $${params.length}`);
      }
      if (query.bay_id) {
        params.push(query.bay_id);
        wheres.push(`bay_id = $${params.length}`);
      }
      if (query.customer_id) {
        params.push(query.customer_id);
        wheres.push(`customer_id = $${params.length}`);
      }
      if (query.from) {
        params.push(query.from);
        wheres.push(`lower(time_range) >= $${params.length}::timestamptz`);
      }
      if (query.to) {
        params.push(query.to);
        wheres.push(`lower(time_range) < $${params.length}::timestamptz`);
      }
      if (query.cursor) {
        let decoded;
        try {
          decoded = decodeCursor(query.cursor);
        } catch (err) {
          throw new BadRequestException({
            code: 'INVALID_CURSOR',
            message: (err as Error).message,
          });
        }
        params.push(decoded.t);
        const tIdx = params.length;
        params.push(decoded.i);
        const iIdx = params.length;
        wheres.push(`(lower(time_range), id) > ($${tIdx}::timestamptz, $${iIdx}::uuid)`);
      }

      const limit = query.limit + 1;
      params.push(limit);
      const limitIdx = params.length;

      const rows = (await manager.query(
        `SELECT * FROM appointment
         WHERE ${wheres.join(' AND ')}
         ORDER BY lower(time_range) ASC, id ASC
         LIMIT $${limitIdx}`,
        params,
      )) as AppointmentRow[];

      const hasMore = rows.length > query.limit;
      const page = hasMore ? rows.slice(0, query.limit) : rows;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last ? encodeCursor(extractLowerBound(last.time_range), last.id) : null;

      return {
        data: page.map(toResponse),
        next_cursor: nextCursor,
        has_more: hasMore,
      };
    });
  }

  async history(id: string, ctx: BookContext): Promise<AppointmentHistoryRow[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      await this.loadAppointment(manager, id); // RLS check + 404
      const rows = (await manager.query(
        `SELECT id, field, old_value, new_value, changed_by, changed_at, reason
         FROM appointment_history
         WHERE appointment_id = $1
         ORDER BY changed_at ASC`,
        [id],
      )) as Array<{
        id: string;
        field: string;
        old_value: unknown;
        new_value: unknown;
        changed_by: string;
        changed_at: Date | string;
        reason: string | null;
      }>;
      return rows.map((r) => ({
        id: r.id,
        field: r.field,
        old_value: r.old_value,
        new_value: r.new_value,
        changed_by: r.changed_by,
        changed_at: r.changed_at instanceof Date ? r.changed_at.toISOString() : String(r.changed_at),
        reason: r.reason,
      }));
    });
  }

  // ===== UPDATE =====

  async reschedule(
    id: string,
    dto: RescheduleAppointmentDto,
    expectedVersion: number,
    ctx: BookContext,
  ): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);

      const current = await this.loadAppointment(manager, id);
      if (current.status !== 'confirmed') {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot reschedule an appointment in status ${current.status}`,
        });
      }

      const sets: string[] = [];
      const params: unknown[] = [];

      // Resolve effective values after the patch
      const effectiveTechnicianId = dto.technician_id ?? current.technician_id;
      const dealership = await this.loadDealership(manager, ctx.dealershipId);
      const service = await this.loadServiceType(manager, current.service_type_id);
      let effectiveRange: ComputedTimeRange | null = null;

      if (dto.start_at !== undefined) {
        effectiveRange = this.buildTimeRange(dto.start_at, service, dealership.timezone);
        params.push(effectiveRange.literal);
        sets.push(`time_range = $${params.length}::tstzrange`);
      }
      if (dto.technician_id !== undefined) {
        params.push(dto.technician_id);
        sets.push(`technician_id = $${params.length}`);
      }
      if (dto.bay_id !== undefined) {
        params.push(dto.bay_id);
        sets.push(`bay_id = $${params.length}`);
      }

      // If start changed OR technician changed, re-run validators against the
      // effective values. We only have a fresh `effectiveRange` for start_at
      // changes; for technician-only changes the existing time_range still
      // applies, so we parse it and validate the technician's shift/skill.
      if (dto.start_at !== undefined || dto.technician_id !== undefined) {
        const validateRange =
          effectiveRange ??
          (() => {
            // current.time_range is `["2026-...","2026-...")` or with spaces — extract bounds
            const match = current.time_range.match(/^[\[\(]"?([^",\]\)]+)"?,"?([^",\]\)]+)"?[\]\)]$/);
            if (!match) {
              throw new Error(`could not parse current time_range: ${current.time_range}`);
            }
            return {
              literal: current.time_range,
              startAtIso: new Date(match[1]!.replace(' ', 'T')).toISOString(),
              endAtIso: new Date(match[2]!.replace(' ', 'T')).toISOString(),
            } satisfies ComputedTimeRange;
          })();
        await this.runBookingValidators(
          manager,
          validateRange,
          ctx.dealershipId,
          dealership.timezone,
          effectiveTechnicianId,
          service.required_skill_id,
        );
      }

      params.push(id);
      const idIdx = params.length;
      params.push(expectedVersion);
      const versionIdx = params.length;

      let updated: AppointmentRow;
      try {
        const result = (await manager.query(
          `UPDATE appointment
              SET ${sets.join(', ')}
            WHERE id = $${idIdx} AND version = $${versionIdx}
            RETURNING *`,
          params,
        )) as AppointmentRow[];

        if (result.length === 0) {
          this.metrics.optimisticLockFailuresTotal.inc();
          throw new PreconditionFailedException({
            code: 'PRECONDITION_FAILED',
            message: 'Appointment was modified; refresh and retry',
            currentVersion: current.version,
          });
        }
        updated = result[0]!;
      } catch (err) {
        if (err instanceof PreconditionFailedException) throw err;
        throw this.translateDbError(err);
      }

      await this.recordHistory(
        manager,
        updated,
        ctx,
        'rescheduled',
        toResponse(current),
        toResponse(updated),
      );
      await this.publishOutbox(manager, updated, ctx, 'appointment.rescheduled');

      this.logger.log(`appointment.rescheduled id=${id} v=${updated.version}`);
      return toResponse(updated);
    });
  }

  async cancel(id: string, expectedVersion: number, ctx: BookContext): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);

      const current = await this.loadAppointment(manager, id);
      if (current.status !== 'confirmed') {
        throw new ConflictException({
          code: 'INVALID_STATUS_TRANSITION',
          message: `Cannot cancel an appointment in status ${current.status}`,
        });
      }

      let updated: AppointmentRow;
      try {
        const result = (await manager.query(
          `UPDATE appointment
              SET status = 'cancelled'
            WHERE id = $1 AND version = $2
            RETURNING *`,
          [id, expectedVersion],
        )) as AppointmentRow[];

        if (result.length === 0) {
          this.metrics.optimisticLockFailuresTotal.inc();
          throw new PreconditionFailedException({
            code: 'PRECONDITION_FAILED',
            message: 'Appointment was modified; refresh and retry',
            currentVersion: current.version,
          });
        }
        updated = result[0]!;
      } catch (err) {
        if (err instanceof PreconditionFailedException) throw err;
        throw this.translateDbError(err);
      }

      await this.recordHistory(
        manager,
        updated,
        ctx,
        'cancelled',
        toResponse(current),
        toResponse(updated),
      );
      await this.publishOutbox(manager, updated, ctx, 'appointment.cancelled');

      this.metrics.appointmentsStatusTransitionTotal
        .labels({ from: current.status, to: updated.status })
        .inc();
      this.logger.log(`appointment.cancelled id=${id}`);
      return toResponse(updated);
    });
  }

  // ===== HELPERS =====

  private async setRlsContext(manager: EntityManager, ctx: BookContext): Promise<void> {
    await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
  }

  private async loadDealership(manager: EntityManager, id: string): Promise<DealershipRow> {
    const rows = (await manager.query(`SELECT id, timezone FROM dealership WHERE id = $1`, [
      id,
    ])) as DealershipRow[];
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'DEALERSHIP_NOT_FOUND' });
    }
    return rows[0]!;
  }

  private async loadServiceType(manager: EntityManager, id: string): Promise<ServiceTypeRow> {
    const rows = (await manager.query(
      `SELECT id, duration_minutes, buffer_minutes, required_skill_id FROM service_type WHERE id = $1`,
      [id],
    )) as ServiceTypeRow[];
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'SERVICE_TYPE_NOT_FOUND' });
    }
    return rows[0]!;
  }

  private async loadAppointment(manager: EntityManager, id: string): Promise<AppointmentRow> {
    const rows = (await manager.query(`SELECT * FROM appointment WHERE id = $1`, [id])) as AppointmentRow[];
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'APPOINTMENT_NOT_FOUND' });
    }
    return rows[0]!;
  }

  private buildTimeRange(
    startAt: string,
    service: ServiceTypeRow,
    timezone: string,
  ): ComputedTimeRange {
    try {
      return computeTimeRange({
        startAt,
        durationMinutes: service.duration_minutes,
        bufferMinutes: service.buffer_minutes,
        timezone,
      });
    } catch (err) {
      if (err instanceof InvalidLocalTimeError) {
        this.metrics.dstValidationFailuresTotal.inc();
        throw new ConflictException({ code: 'INVALID_LOCAL_TIME', message: err.message });
      }
      throw err;
    }
  }

  private async runBookingValidators(
    manager: EntityManager,
    range: ComputedTimeRange,
    dealershipId: string,
    timezone: string,
    technicianId: string,
    requiredSkillId: string | null,
  ): Promise<void> {
    const ctx = {
      manager,
      dealershipId,
      timezone,
      startAtIso: range.startAtIso,
      endAtIso: range.endAtIso,
    };
    try {
      // 1. DST cross-safety (in-memory walk)
      validateRangeDoesNotCrossUnsafeDstTransition(range.startAtIso, range.endAtIso, timezone);
      // 2. Skill match (one query, fast)
      await validateSkillMatch(ctx, technicianId, requiredSkillId);
      // 3. Business hours / closed exception
      await validateBusinessHours(ctx);
      // 4. Technician shift / time-off
      await validateTechnicianAvailability(ctx, technicianId);
    } catch (err) {
      if (err instanceof BookingValidationError) {
        throw new ConflictException({ code: err.code, message: err.message, ...err.extra });
      }
      throw err;
    }
  }

  private async recordHistory(
    manager: EntityManager,
    row: AppointmentRow,
    ctx: BookContext,
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO appointment_history
        (appointment_id, dealership_id, field, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        row.id,
        ctx.dealershipId,
        field,
        oldValue === null ? null : JSON.stringify(oldValue),
        JSON.stringify(newValue),
        ctx.userId,
      ],
    );
  }

  private async publishOutbox(
    manager: EntityManager,
    row: AppointmentRow,
    ctx: BookContext,
    eventType: string,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO outbox_event
        (dealership_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, 'appointment', $2, $3, $4::jsonb)`,
      [ctx.dealershipId, row.id, eventType, JSON.stringify(toResponse(row))],
    );
  }

  private translateDbError(err: unknown): Error {
    if (!(err instanceof QueryFailedError)) return err as Error;
    const driver = err.driverError as { code?: string; constraint?: string; detail?: string };
    if (driver.code === '23P01') {
      if (driver.constraint === 'appt_bay_no_overlap') {
        this.metrics.bookingsConflictTotal.labels({ resource: 'bay' }).inc();
        return new ConflictException({
          code: 'BAY_UNAVAILABLE',
          message: 'The requested bay is already booked for this time slot',
          conflictingResource: 'bay',
        });
      }
      if (driver.constraint === 'appt_technician_no_overlap') {
        this.metrics.bookingsConflictTotal.labels({ resource: 'technician' }).inc();
        return new ConflictException({
          code: 'TECHNICIAN_UNAVAILABLE',
          message: 'The technician is not available for this time slot',
          conflictingResource: 'technician',
        });
      }
      this.metrics.bookingsConflictTotal.labels({ resource: 'unknown' }).inc();
      return new ConflictException({ code: 'BOOKING_CONFLICT' });
    }
    if (driver.code === '23514') {
      return new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: driver.detail ?? err.message,
      });
    }
    return err;
  }
}

function toResponse(row: AppointmentRow): AppointmentResponse {
  return {
    id: row.id,
    dealership_id: row.dealership_id,
    customer_id: row.customer_id,
    vehicle_id: row.vehicle_id,
    service_type_id: row.service_type_id,
    technician_id: row.technician_id,
    bay_id: row.bay_id,
    time_range: row.time_range,
    status: row.status,
    version: row.version,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

/**
 * Extract the lower bound of a tstzrange literal `[lower,upper)` (or `(lower,upper]`).
 * Postgres returns the literal as a string when the column is queried via raw SQL.
 */
function extractLowerBound(timeRange: string): string {
  const match = timeRange.match(/^[\[\(]"?([^",\]\)]+)"?,/);
  if (!match) {
    throw new Error(`Could not parse time_range literal: ${timeRange}`);
  }
  return match[1]!;
}
