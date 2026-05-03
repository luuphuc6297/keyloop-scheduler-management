import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  PreconditionFailedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { applyRlsContext } from '../../../shared/db/rls-context';
import { unwrapUpdateRows } from '../../../shared/db/raw-update';
import { MetricsService } from '../../observability/metrics.service';
import {
  computeTimeRange,
  InvalidLocalTimeError,
  type ComputedTimeRange,
} from '../domain/compute-time-range';
import { parseTstzrange, extractLowerBound } from '../domain/parse-time-range';
import {
  BookingValidationError,
  validateBusinessHours,
  validateRangeDoesNotCrossUnsafeDstTransition,
  validateSkillMatch,
  validateTechnicianAvailability,
} from '../domain/validators';
import type { AppointmentResponse, BookAppointmentDto } from '../dtos/book-appointment.schema';
import { decodeCursor, encodeCursor, type ListAppointmentsQuery } from '../dtos/list-appointments.schema';
import type { RescheduleAppointmentDto } from '../dtos/reschedule-appointment.schema';
import { AppointmentHistoryRecorder } from './appointment-history-recorder';
import { DbErrorTranslator } from './db-error-translator';
import { OutboxEmitter } from './outbox-emitter';

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
    private readonly historyRecorder: AppointmentHistoryRecorder,
    private readonly outbox: OutboxEmitter,
    private readonly dbErrors: DbErrorTranslator,
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
      await applyRlsContext(manager, ctx);

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

      const row = await this.insertAppointment(manager, dto, range, ctx);

      const response = toResponse(row);
      await this.historyRecorder.record(manager, row, ctx, 'created', null, response);
      await this.outbox.emit(manager, 'appointment', row.id, 'appointment.confirmed', response, ctx);

      this.metrics.appointmentsCreatedTotal.labels({ dealership_id: ctx.dealershipId }).inc();
      this.logger.log(`appointment.booked id=${row.id} dealership=${ctx.dealershipId}`);
      return response;
    });
  }

  private async insertAppointment(
    manager: EntityManager,
    dto: BookAppointmentDto,
    range: ComputedTimeRange,
    ctx: BookContext,
  ): Promise<AppointmentRow> {
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
      if (!row) {
        throw new InternalServerErrorException({ code: 'INSERT_RETURNED_NO_ROW' });
      }
      return row;
    } catch (err) {
      throw this.dbErrors.translate(err);
    }
  }

  // ===== READ =====

  async findById(id: string, ctx: BookContext): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, ctx);
      const row = await this.loadAppointment(manager, id);
      return toResponse(row);
    });
  }

  async list(query: ListAppointmentsQuery, ctx: BookContext): Promise<ListResult> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, ctx);
      const { wheres, params } = this.buildListWhere(query, ctx);

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
      const nextCursor = hasMore && last ? encodeCursor(extractLowerBound(last.time_range), last.id) : null;

      return {
        data: page.map(toResponse),
        next_cursor: nextCursor,
        has_more: hasMore,
      };
    });
  }

  private buildListWhere(
    query: ListAppointmentsQuery,
    ctx: BookContext,
  ): { wheres: string[]; params: unknown[] } {
    const wheres: string[] = ['dealership_id = $1'];
    const params: unknown[] = [ctx.dealershipId];

    const append = (sql: (idx: number) => string, value: unknown): void => {
      params.push(value);
      wheres.push(sql(params.length));
    };

    if (query.status) append((idx) => `status = $${idx}`, query.status);
    if (query.technician_id) append((idx) => `technician_id = $${idx}`, query.technician_id);
    if (query.bay_id) append((idx) => `bay_id = $${idx}`, query.bay_id);
    if (query.customer_id) append((idx) => `customer_id = $${idx}`, query.customer_id);
    if (query.from) append((idx) => `lower(time_range) >= $${idx}::timestamptz`, query.from);
    if (query.to) append((idx) => `lower(time_range) < $${idx}::timestamptz`, query.to);

    if (query.cursor) {
      const decoded = this.decodeCursorOrThrow(query.cursor);
      params.push(decoded.t);
      const tIdx = params.length;
      params.push(decoded.i);
      const iIdx = params.length;
      wheres.push(`(lower(time_range), id) > ($${tIdx}::timestamptz, $${iIdx}::uuid)`);
    }

    return { wheres, params };
  }

  private decodeCursorOrThrow(cursor: string): { t: string; i: string } {
    try {
      return decodeCursor(cursor);
    } catch (err) {
      throw new BadRequestException({
        code: 'INVALID_CURSOR',
        message: (err as Error).message,
      });
    }
  }

  async history(id: string, ctx: BookContext): Promise<AppointmentHistoryRow[]> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, ctx);
      await this.loadAppointment(manager, id);
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
      await applyRlsContext(manager, ctx);

      const current = await this.loadAppointment(manager, id);
      this.assertConfirmed(current, 'reschedule');

      const dealership = await this.loadDealership(manager, ctx.dealershipId);
      const service = await this.loadServiceType(manager, current.service_type_id);

      const update = this.buildRescheduleUpdate(dto, service, dealership.timezone);

      if (dto.start_at !== undefined || dto.technician_id !== undefined) {
        const validateRange = update.range ?? this.parseExistingRange(current);
        await this.runBookingValidators(
          manager,
          validateRange,
          ctx.dealershipId,
          dealership.timezone,
          dto.technician_id ?? current.technician_id,
          service.required_skill_id,
        );
      }

      const updated = await this.applyOptimisticUpdate(
        manager,
        id,
        expectedVersion,
        update.sets,
        update.params,
        current.version,
      );

      const oldResponse = toResponse(current);
      const newResponse = toResponse(updated);
      await this.historyRecorder.record(manager, updated, ctx, 'rescheduled', oldResponse, newResponse);
      await this.outbox.emit(manager, 'appointment', updated.id, 'appointment.rescheduled', newResponse, ctx);

      this.logger.log(`appointment.rescheduled id=${id} v=${updated.version}`);
      return newResponse;
    });
  }

  async cancel(id: string, expectedVersion: number, ctx: BookContext): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, ctx);

      const current = await this.loadAppointment(manager, id);
      this.assertConfirmed(current, 'cancel');

      const updated = await this.applyOptimisticUpdate(
        manager,
        id,
        expectedVersion,
        ["status = 'cancelled'"],
        [],
        current.version,
      );

      const oldResponse = toResponse(current);
      const newResponse = toResponse(updated);
      await this.historyRecorder.record(manager, updated, ctx, 'cancelled', oldResponse, newResponse);
      await this.outbox.emit(manager, 'appointment', updated.id, 'appointment.cancelled', newResponse, ctx);

      this.metrics.appointmentsStatusTransitionTotal
        .labels({ from: current.status, to: updated.status })
        .inc();
      this.logger.log(`appointment.cancelled id=${id}`);
      return newResponse;
    });
  }

  // ===== HELPERS =====

  private assertConfirmed(row: AppointmentRow, action: 'reschedule' | 'cancel'): void {
    if (row.status === 'confirmed') return;
    throw new ConflictException({
      code: 'INVALID_STATUS_TRANSITION',
      message: `Cannot ${action} an appointment in status ${row.status}`,
    });
  }

  private buildRescheduleUpdate(
    dto: RescheduleAppointmentDto,
    service: ServiceTypeRow,
    timezone: string,
  ): { sets: string[]; params: unknown[]; range: ComputedTimeRange | null } {
    const sets: string[] = [];
    const params: unknown[] = [];
    let range: ComputedTimeRange | null = null;

    if (dto.start_at !== undefined) {
      range = this.buildTimeRange(dto.start_at, service, timezone);
      params.push(range.literal);
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
    return { sets, params, range };
  }

  private parseExistingRange(row: AppointmentRow): ComputedTimeRange {
    const { startAtIso, endAtIso } = parseTstzrange(row.time_range);
    return { literal: row.time_range, startAtIso, endAtIso };
  }

  private async applyOptimisticUpdate(
    manager: EntityManager,
    id: string,
    expectedVersion: number,
    sets: string[],
    setParams: unknown[],
    currentVersion: number,
  ): Promise<AppointmentRow> {
    const params = [...setParams, id, expectedVersion];
    const idIdx = setParams.length + 1;
    const versionIdx = setParams.length + 2;

    try {
      // NOTE: TypeORM 0.3.x wraps UPDATE...RETURNING as [rows, rowCount] —
      // unwrap or every field on the returned row reads as undefined.
      const raw = await manager.query(
        `UPDATE appointment
            SET ${sets.join(', ')}
          WHERE id = $${idIdx} AND version = $${versionIdx}
          RETURNING *`,
        params,
      );
      const rows = unwrapUpdateRows<AppointmentRow>(raw);

      if (rows.length === 0) {
        this.metrics.optimisticLockFailuresTotal.inc();
        throw new PreconditionFailedException({
          code: 'PRECONDITION_FAILED',
          message: 'Appointment was modified; refresh and retry',
          currentVersion,
        });
      }
      return rows[0]!;
    } catch (err) {
      if (err instanceof PreconditionFailedException) throw err;
      throw this.dbErrors.translate(err);
    }
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

  private buildTimeRange(startAt: string, service: ServiceTypeRow, timezone: string): ComputedTimeRange {
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
      validateRangeDoesNotCrossUnsafeDstTransition(range.startAtIso, range.endAtIso, timezone);
      await validateSkillMatch(ctx, technicianId, requiredSkillId);
      await validateBusinessHours(ctx);
      await validateTechnicianAvailability(ctx, technicianId);
    } catch (err) {
      if (err instanceof BookingValidationError) {
        throw new ConflictException({ code: err.code, message: err.message, ...err.extra });
      }
      throw err;
    }
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
