import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { DateTime } from 'luxon';
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

const SLOT_GRANULARITY_MIN = 30;

/**
 * Returns free 30-min slot starts in `[from, to)` for the given service type.
 *
 * Simplified vs spec Appendix B: this slice does NOT factor in business hours,
 * technician shifts, or time-off. It just subtracts confirmed bookings from the
 * candidate slot grid. This is enough for the demo and clients can layer business
 * hours filtering on the FE; full server-side logic is queued for Phase 6.
 */
@Injectable()
export class AvailabilityService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findSlots(query: AvailabilityQuery, ctx: BookContext): Promise<AvailabilitySlot[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);

      const service = await this.loadServiceType(manager, query.service_type_id);
      const totalMin = service.duration_minutes + service.buffer_minutes;

      const technicians = await this.resolveTechnicians(
        manager,
        ctx.dealershipId,
        query.technician_id,
        service.required_skill_id,
      );
      if (technicians.length === 0) return [];

      const techIds = technicians.map((t) => t.id);
      const booked = await this.loadBookings(manager, techIds, query.from, query.to);
      const bookedByTech = groupByTech(booked);

      const slots: AvailabilitySlot[] = [];
      const fromDt = DateTime.fromISO(query.from, { setZone: true });
      const toDt = DateTime.fromISO(query.to, { setZone: true });

      for (const tech of technicians) {
        const techBookings = bookedByTech.get(tech.id) ?? [];
        let cursor = alignToGrid(fromDt);
        while (cursor.plus({ minutes: totalMin }) <= toDt) {
          const slotStart = cursor;
          const slotEnd = slotStart.plus({ minutes: totalMin });
          const overlaps = techBookings.some((b) => {
            const bLower = DateTime.fromISO(b.lower, { setZone: true });
            const bUpper = DateTime.fromISO(b.upper, { setZone: true });
            return slotStart < bUpper && slotEnd > bLower;
          });
          if (!overlaps) {
            slots.push({
              start_at: slotStart.toUTC().toISO()!,
              end_at: slotEnd.toUTC().toISO()!,
              technician_id: tech.id,
              bay_id: query.bay_id ?? null,
            });
          }
          cursor = cursor.plus({ minutes: SLOT_GRANULARITY_MIN });
        }
      }

      return slots;
    });
  }

  private async setRlsContext(manager: EntityManager, ctx: BookContext): Promise<void> {
    await manager.query(`SELECT set_config('app.current_dealership', $1, true)`, [ctx.dealershipId]);
    await manager.query(`SELECT set_config('app.current_user_id', $1, true)`, [ctx.userId]);
  }

  private async loadServiceType(manager: EntityManager, id: string): Promise<ServiceTypeRow> {
    const rows = (await manager.query(
      `SELECT id, duration_minutes, buffer_minutes, required_skill_id
         FROM service_type WHERE id = $1`,
      [id],
    )) as ServiceTypeRow[];
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'SERVICE_TYPE_NOT_FOUND' });
    }
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
        `SELECT id FROM technician WHERE id = $1 AND dealership_id = $2`,
        [technicianId, dealershipId],
      )) as TechnicianRow[];
      return rows;
    }
    if (requiredSkillId) {
      return (await manager.query(
        `SELECT t.id
           FROM technician t
           JOIN technician_skill ts ON ts.technician_id = t.id
          WHERE t.dealership_id = $1 AND ts.skill_id = $2`,
        [dealershipId, requiredSkillId],
      )) as TechnicianRow[];
    }
    return (await manager.query(`SELECT id FROM technician WHERE dealership_id = $1`, [
      dealershipId,
    ])) as TechnicianRow[];
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
}

function groupByTech(bookings: BookedRange[]): Map<string, BookedRange[]> {
  const map = new Map<string, BookedRange[]>();
  for (const b of bookings) {
    const arr = map.get(b.technician_id) ?? [];
    arr.push(b);
    map.set(b.technician_id, arr);
  }
  return map;
}

function alignToGrid(dt: DateTime): DateTime {
  const minute = dt.minute;
  const remainder = minute % SLOT_GRANULARITY_MIN;
  if (remainder === 0 && dt.second === 0 && dt.millisecond === 0) return dt;
  return dt
    .set({ minute: minute - remainder, second: 0, millisecond: 0 })
    .plus({ minutes: SLOT_GRANULARITY_MIN });
}
