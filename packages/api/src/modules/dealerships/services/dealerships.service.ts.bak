import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { applyRlsContext } from '../../../shared/db/rls-context';

interface CatalogContext {
  userId: string;
  dealershipId: string;
}

export interface DealershipResponse {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface ServiceTypeResponse {
  id: string;
  name: string;
  duration_minutes: number;
  buffer_minutes: number;
  required_skill_id: string | null;
}

export interface TechnicianResponse {
  id: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  is_active: boolean;
  skills: string[];
}

export interface BayResponse {
  id: string;
  name: string;
  is_active: boolean;
}

export interface BusinessHoursResponse {
  hours: Array<{
    day_of_week: number;
    open_time: string;
    close_time: string;
  }>;
  exceptions: Array<{
    date: string;
    is_closed: boolean;
    override_open: string | null;
    override_close: string | null;
    reason: string | null;
  }>;
}

@Injectable()
export class DealershipsService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async findMe(ctx: CatalogContext): Promise<DealershipResponse> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      const rows = (await manager.query(
        `SELECT id, name, timezone, created_at, updated_at
           FROM dealership WHERE id = $1`,
        [ctx.dealershipId],
      )) as Array<{
        id: string;
        name: string;
        timezone: string;
        created_at: Date | string;
        updated_at: Date | string;
      }>;
      if (rows.length === 0) {
        throw new NotFoundException({ code: 'DEALERSHIP_NOT_FOUND' });
      }
      const r = rows[0]!;
      return {
        id: r.id,
        name: r.name,
        timezone: r.timezone,
        created_at: toIso(r.created_at),
        updated_at: toIso(r.updated_at),
      };
    });
  }

  async listServiceTypes(ctx: CatalogContext): Promise<ServiceTypeResponse[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      return (await manager.query(
        `SELECT id, name, duration_minutes, buffer_minutes, required_skill_id
           FROM service_type
          WHERE dealership_id = $1
          ORDER BY name ASC`,
        [ctx.dealershipId],
      )) as ServiceTypeResponse[];
    });
  }

  async listTechnicians(ctx: CatalogContext): Promise<TechnicianResponse[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      const rows = (await manager.query(
        `SELECT t.id, t.first_name, t.last_name, t.employee_code, t.is_active,
                COALESCE(
                  (SELECT array_agg(s.code ORDER BY s.code)
                     FROM technician_skill ts
                     JOIN skill s ON s.id = ts.skill_id
                    WHERE ts.technician_id = t.id),
                  ARRAY[]::text[]
                ) AS skills
           FROM technician t
          WHERE t.dealership_id = $1
          ORDER BY t.last_name ASC, t.first_name ASC`,
        [ctx.dealershipId],
      )) as Array<{
        id: string;
        first_name: string;
        last_name: string;
        employee_code: string;
        is_active: boolean;
        skills: string[];
      }>;
      return rows.map((r) => ({
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        employee_code: r.employee_code,
        is_active: r.is_active,
        skills: r.skills ?? [],
      }));
    });
  }

  async listBays(ctx: CatalogContext): Promise<BayResponse[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      return (await manager.query(
        `SELECT id, name, is_active FROM bay
          WHERE dealership_id = $1
          ORDER BY name ASC`,
        [ctx.dealershipId],
      )) as BayResponse[];
    });
  }

  async getBusinessHours(ctx: CatalogContext): Promise<BusinessHoursResponse> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      const hours = (await manager.query(
        `SELECT day_of_week, open_time::text AS open_time, close_time::text AS close_time
           FROM business_hours
          WHERE dealership_id = $1
          ORDER BY day_of_week ASC`,
        [ctx.dealershipId],
      )) as Array<{ day_of_week: number; open_time: string; close_time: string }>;
      const exceptions = (await manager.query(
        `SELECT date::text, is_closed,
                override_open::text AS override_open,
                override_close::text AS override_close,
                reason
           FROM business_hours_exception
          WHERE dealership_id = $1
          ORDER BY date ASC`,
        [ctx.dealershipId],
      )) as Array<{
        date: string;
        is_closed: boolean;
        override_open: string | null;
        override_close: string | null;
        reason: string | null;
      }>;
      return { hours, exceptions };
    });
  }

  private async setRlsContext(manager: EntityManager, ctx: CatalogContext): Promise<void> {
    await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
  }
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
