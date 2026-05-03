import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { applyRlsContext } from '../../../shared/db/rls-context';
import { unwrapUpdateRows } from '../../../shared/db/raw-update';
import { MetricsService } from '../../observability/metrics.service';
import type {
  CustomerExportResponse,
  CustomerResponse,
  SearchCustomersQuery,
} from '../dtos/customer.schema';

interface CustomerContext {
  userId: string;
  dealershipId: string;
}

interface CustomerRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  anonymized_at: Date | null;
  created_at: Date;
}

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  async search(query: SearchCustomersQuery, ctx: CustomerContext): Promise<CustomerResponse[]> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });

      const wheres: string[] = ['dealership_id = $1', 'anonymized_at IS NULL'];
      const params: unknown[] = [ctx.dealershipId];
      if (query.q) {
        params.push(`%${query.q.toLowerCase()}%`);
        const idx = params.length;
        wheres.push(
          `(LOWER(first_name) LIKE $${idx} OR LOWER(last_name) LIKE $${idx} OR LOWER(email::text) LIKE $${idx})`,
        );
      }
      params.push(query.limit);
      const limitIdx = params.length;

      const rows = (await manager.query(
        `SELECT id, first_name, last_name, email::text AS email, phone, anonymized_at, created_at
           FROM customer
          WHERE ${wheres.join(' AND ')}
          ORDER BY last_name ASC, first_name ASC
          LIMIT $${limitIdx}`,
        params,
      )) as CustomerRow[];

      return rows.map(toResponse);
    });
  }

  async findById(id: string, ctx: CustomerContext): Promise<CustomerResponse> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
      const row = await this.loadCustomer(manager, id);
      return toResponse(row);
    });
  }

  async anonymize(id: string, reason: string, ctx: CustomerContext): Promise<CustomerResponse> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
      const row = await this.loadCustomer(manager, id);
      if (row.anonymized_at) {
        throw new ConflictException({
          code: 'ALREADY_ANONYMIZED',
          message: 'Customer has already been anonymized',
        });
      }
      // NOTE: TypeORM 0.3.x wraps UPDATE...RETURNING as [rows, rowCount].
      // See shared/db/raw-update.ts for context.
      const raw = await manager.query(
        `UPDATE customer
            SET first_name = 'REDACTED',
                last_name = 'REDACTED',
                email = NULL,
                phone = NULL,
                anonymized_at = now(),
                anonymization_reason = $2
          WHERE id = $1
          RETURNING id, first_name, last_name, email::text AS email,
                    phone, anonymized_at, created_at`,
        [id, reason],
      );
      const updated = unwrapUpdateRows<CustomerRow>(raw);

      // Outbox event so downstream systems can purge derived data
      await manager.query(
        `INSERT INTO outbox_event
          (dealership_id, aggregate_type, aggregate_id, event_type, payload)
         VALUES ($1, 'customer', $2, 'customer.anonymized', $3::jsonb)`,
        [ctx.dealershipId, id, JSON.stringify({ id, reason, requested_by: ctx.userId })],
      );

      this.metrics.gdprAnonymizationTotal.inc();
      this.logger.log(`customer.anonymized id=${id} dealership=${ctx.dealershipId}`);
      return toResponse(updated[0]!);
    });
  }

  async exportData(id: string, ctx: CustomerContext): Promise<CustomerExportResponse> {
    return this.ds.transaction(async (manager) => {
      await applyRlsContext(manager, { dealershipId: ctx.dealershipId, userId: ctx.userId });
      const row = await this.loadCustomer(manager, id);

      const vehicles = (await manager.query(
        `SELECT id, vin, make, model, year, created_at
           FROM vehicle WHERE customer_id = $1
          ORDER BY created_at ASC`,
        [id],
      )) as Array<{
        id: string;
        vin: string;
        make: string;
        model: string;
        year: number;
        created_at: Date | string;
      }>;

      const appointments = (await manager.query(
        `SELECT id, service_type_id, technician_id, bay_id,
                time_range, status, created_at
           FROM appointment WHERE customer_id = $1
          ORDER BY lower(time_range) ASC`,
        [id],
      )) as Array<{
        id: string;
        service_type_id: string;
        technician_id: string;
        bay_id: string;
        time_range: string;
        status: string;
        created_at: Date | string;
      }>;

      return {
        customer: toResponse(row),
        vehicles: vehicles.map((v) => ({
          ...v,
          created_at: toIso(v.created_at),
        })),
        appointments: appointments.map((a) => ({
          ...a,
          created_at: toIso(a.created_at),
        })),
      };
    });
  }

  private async loadCustomer(manager: EntityManager, id: string): Promise<CustomerRow> {
    const rows = (await manager.query(
      `SELECT id, first_name, last_name, email::text AS email,
              phone, anonymized_at, created_at
         FROM customer WHERE id = $1`,
      [id],
    )) as CustomerRow[];
    if (rows.length === 0) {
      throw new NotFoundException({ code: 'CUSTOMER_NOT_FOUND' });
    }
    return rows[0]!;
  }
}

function toResponse(row: CustomerRow): CustomerResponse {
  return {
    id: row.id,
    first_name: row.first_name,
    last_name: row.last_name,
    email: row.email ?? null,
    phone: row.phone ?? null,
    anonymized_at: row.anonymized_at ? toIso(row.anonymized_at) : null,
    created_at: toIso(row.created_at),
  };
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}
