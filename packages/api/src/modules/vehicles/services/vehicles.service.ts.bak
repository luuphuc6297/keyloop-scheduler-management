import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { applyRlsContext } from '../../../shared/db/rls-context';
import type { SearchVehiclesQuery, VehicleResponse } from '../dtos/vehicle.schema';

interface VehicleContext {
  userId: string;
  dealershipId: string;
}

interface VehicleRow {
  id: string;
  customer_id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  created_at: Date | string;
  updated_at: Date | string;
}

@Injectable()
export class VehiclesService {
  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  async search(query: SearchVehiclesQuery, ctx: VehicleContext): Promise<VehicleResponse[]> {
    return this.ds.transaction(async (manager) => {
      await this.setRlsContext(manager, ctx);
      const wheres: string[] = ['dealership_id = $1'];
      const params: unknown[] = [ctx.dealershipId];
      if (query.vin) {
        params.push(`%${query.vin.toUpperCase()}%`);
        wheres.push(`UPPER(vin) LIKE $${params.length}`);
      }
      if (query.customer_id) {
        params.push(query.customer_id);
        wheres.push(`customer_id = $${params.length}`);
      }
      params.push(query.limit);
      const limitIdx = params.length;
      const rows = (await manager.query(
        `SELECT id, customer_id, vin, make, model, year, created_at, updated_at
           FROM vehicle
          WHERE ${wheres.join(' AND ')}
          ORDER BY created_at DESC
          LIMIT $${limitIdx}`,
        params,
      )) as VehicleRow[];
      return rows.map(toResponse);
    });
  }

  private async setRlsContext(manager: EntityManager, ctx: VehicleContext): Promise<void> {
    await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
  }
}

function toResponse(row: VehicleRow): VehicleResponse {
  return {
    id: row.id,
    customer_id: row.customer_id,
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}
