import { Injectable } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

interface EmitContext {
  dealershipId: string;
}

@Injectable()
export class OutboxEmitter {
  async emit(
    manager: EntityManager,
    aggregateType: string,
    aggregateId: string,
    eventType: string,
    payload: object,
    ctx: EmitContext,
  ): Promise<void> {
    await manager.query(
      `INSERT INTO outbox_event
        (dealership_id, aggregate_type, aggregate_id, event_type, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [ctx.dealershipId, aggregateType, aggregateId, eventType, JSON.stringify(payload)],
    );
  }
}
