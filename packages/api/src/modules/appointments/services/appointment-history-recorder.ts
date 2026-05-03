import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

interface RecordContext {
  dealershipId: string;
  userId: string;
}

interface AppointmentLike {
  id: string;
}

@Injectable()
export class AppointmentHistoryRecorder {
  async record(
    manager: EntityManager,
    appointment: AppointmentLike,
    ctx: RecordContext,
    field: string,
    oldValue: unknown,
    newValue: unknown,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO appointment_history
        (appointment_id, dealership_id, field, old_value, new_value, changed_by)
       VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6)`,
      [
        appointment.id,
        ctx.dealershipId,
        field,
        oldValue === null ? null : JSON.stringify(oldValue),
        JSON.stringify(newValue),
        ctx.userId,
      ],
    );
  }
}
