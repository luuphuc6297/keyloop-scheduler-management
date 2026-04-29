import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { computeTimeRange, InvalidLocalTimeError } from '../domain/compute-time-range';
import type { AppointmentResponse, BookAppointmentDto } from '../dtos/book-appointment.schema';

interface BookContext {
  userId: string;
  dealershipId: string;
}

interface ServiceTypeRow {
  id: string;
  duration_minutes: number;
  buffer_minutes: number;
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

@Injectable()
export class AppointmentsService {
  private readonly logger = new Logger(AppointmentsService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async book(dto: BookAppointmentDto, ctx: BookContext): Promise<AppointmentResponse> {
    return this.ds.transaction(async (manager) => {
      // Use owner-bypass fashion in tests by setting GUC; in production, the
      // RlsContextInterceptor wraps the request in a tx with GUC set already.
      // Set GUC defensively here for the case where this service is called
      // outside an interceptor (e.g. seed scripts, CLI).
      await manager.query(`SELECT set_config('app.current_dealership', $1, true)`, [ctx.dealershipId]);
      await manager.query(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.userId]);

      const dealership = (await manager.query(`SELECT id, timezone FROM dealership WHERE id = $1`, [
        ctx.dealershipId,
      ])) as DealershipRow[];
      if (dealership.length === 0) {
        throw new NotFoundException({ code: 'DEALERSHIP_NOT_FOUND' });
      }
      const dealershipRow = dealership[0]!;

      const services = (await manager.query(
        `SELECT id, duration_minutes, buffer_minutes FROM service_type WHERE id = $1`,
        [dto.service_type_id],
      )) as ServiceTypeRow[];
      if (services.length === 0) {
        throw new NotFoundException({ code: 'SERVICE_TYPE_NOT_FOUND' });
      }
      const service = services[0]!;

      let timeRange: string;
      try {
        timeRange = computeTimeRange({
          startAt: dto.start_at,
          durationMinutes: service.duration_minutes,
          bufferMinutes: service.buffer_minutes,
          timezone: dealershipRow.timezone,
        });
      } catch (err) {
        if (err instanceof InvalidLocalTimeError) {
          throw new ConflictException({ code: 'INVALID_LOCAL_TIME', message: err.message });
        }
        throw err;
      }

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
            timeRange,
            ctx.userId,
          ],
        )) as AppointmentRow[];

        const row = inserted[0];
        if (!row) throw new Error('No row returned from INSERT');

        // Audit history (same tx)
        await manager.query(
          `INSERT INTO appointment_history (appointment_id, dealership_id, field, new_value, changed_by)
           VALUES ($1, $2, 'created', $3::jsonb, $4)`,
          [row.id, ctx.dealershipId, JSON.stringify(toResponse(row)), ctx.userId],
        );

        // Outbox event (same tx — at-least-once delivery aligned with commit)
        await manager.query(
          `INSERT INTO outbox_event
            (dealership_id, aggregate_type, aggregate_id, event_type, payload)
           VALUES ($1, 'appointment', $2, 'appointment.confirmed', $3::jsonb)`,
          [ctx.dealershipId, row.id, JSON.stringify(toResponse(row))],
        );

        this.logger.log(`appointment.booked id=${row.id} dealership=${ctx.dealershipId}`);
        return toResponse(row);
      } catch (err) {
        throw this.translateDbError(err);
      }
    });
  }

  private translateDbError(err: unknown): Error {
    if (!(err instanceof QueryFailedError)) return err as Error;
    const driver = err.driverError as { code?: string; constraint?: string; detail?: string };
    if (driver.code !== '23P01') return err;

    if (driver.constraint === 'appt_bay_no_overlap') {
      return new ConflictException({
        code: 'BAY_UNAVAILABLE',
        message: 'The requested bay is already booked for this time slot',
        conflictingResource: 'bay',
      });
    }
    if (driver.constraint === 'appt_technician_no_overlap') {
      return new ConflictException({
        code: 'TECHNICIAN_UNAVAILABLE',
        message: 'The technician is not available for this time slot',
        conflictingResource: 'technician',
      });
    }
    return new ConflictException({ code: 'BOOKING_CONFLICT' });
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
