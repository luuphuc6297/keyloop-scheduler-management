import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { applyRlsContext } from '../../../shared/db/rls-context';
import { MetricsService } from '../../observability/metrics.service';

/**
 * Polling outbox publisher. Picks up `outbox_event` rows where
 * `published_at IS NULL`, marks them published, and emits a structured log
 * line that downstream consumers (Kafka bridge, webhook dispatcher, etc.) can
 * tail in production. For the demo, log-only delivery is sufficient — the
 * design doc §9.3 describes Kafka/HTTP fan-out as out-of-scope plumbing.
 *
 * Concurrency-safe via `FOR UPDATE SKIP LOCKED`: multiple worker replicas can
 * run side-by-side without double-publishing.
 *
 * Per-dealership pass: the outbox table has RLS scoped to `app.current_dealership`,
 * so we discover dealerships with backlog first, then claim a batch per tenant.
 */
@Injectable()
export class OutboxPublisherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private readonly intervalMs = Number(process.env.OUTBOX_POLL_INTERVAL_MS ?? 5_000);
  private readonly batchSize = Number(process.env.OUTBOX_BATCH_SIZE ?? 50);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly metrics: MetricsService,
  ) {}

  onModuleInit(): void {
    if (process.env.OUTBOX_PUBLISHER_ENABLED === 'false') {
      this.logger.log('Outbox publisher disabled via OUTBOX_PUBLISHER_ENABLED=false');
      return;
    }
    this.timer = setInterval(() => {
      this.tick().catch((err: unknown) => {
        this.logger.error(`outbox tick failed: ${(err as Error).message}`);
      });
    }, this.intervalMs);
    this.logger.log(`Outbox publisher started (every ${this.intervalMs}ms, batch=${this.batchSize})`);
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * Public for tests and one-shot triggers.
   */
  async tick(): Promise<{ published: number; perDealership: Record<string, number> }> {
    if (this.running) return { published: 0, perDealership: {} };
    this.running = true;
    try {
      // Discover dealerships with backlog (BYPASSRLS not assumed; we do this per-tenant)
      const tenants = (await this.ds.query(
        `SELECT DISTINCT dealership_id FROM outbox_event WHERE published_at IS NULL`,
      )) as Array<{ dealership_id: string }>;

      const perDealership: Record<string, number> = {};
      let total = 0;
      for (const { dealership_id } of tenants) {
        const count = await this.ds.transaction(async (manager) =>
          this.publishOneBatch(manager, dealership_id),
        );
        perDealership[dealership_id] = count;
        total += count;
      }

      // Update lag gauge: max(now - occurred_at) over remaining unpublished rows
      const lagRows = (await this.ds.query(
        `SELECT EXTRACT(EPOCH FROM (now() - MIN(occurred_at)))::float AS lag
           FROM outbox_event WHERE published_at IS NULL`,
      )) as Array<{ lag: number | null }>;
      const lag = lagRows[0]?.lag ?? 0;
      this.metrics.outboxLagSeconds.set(lag ?? 0);

      if (total > 0) {
        this.logger.log(`Outbox tick: published=${total} per_tenant=${JSON.stringify(perDealership)}`);
      }
      return { published: total, perDealership };
    } finally {
      this.running = false;
    }
  }

  private async publishOneBatch(manager: EntityManager, dealershipId: string): Promise<number> {
    await applyRlsContext(manager, {
      dealershipId,
      // Synthetic system user id for RLS policies that look at app.current_user_id
      userId: '00000000-0000-0000-0000-000000000000',
    });

    const claimed = (await manager.query(
      `SELECT id, aggregate_type, aggregate_id, event_type, payload, occurred_at, attempt_count
         FROM outbox_event
        WHERE dealership_id = $1 AND published_at IS NULL
        ORDER BY occurred_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [dealershipId, this.batchSize],
    )) as Array<{
      id: string;
      aggregate_type: string;
      aggregate_id: string;
      event_type: string;
      payload: Record<string, unknown>;
      occurred_at: Date | string;
      attempt_count: number;
    }>;

    if (claimed.length === 0) return 0;

    let success = 0;
    for (const event of claimed) {
      try {
        // Demo delivery: structured log emit. Production code would replace
        // this block with Kafka producer, webhook fan-out, or SNS publish.
        this.logger.log(
          `outbox.delivered ${JSON.stringify({
            event_id: event.id,
            event_type: event.event_type,
            aggregate_type: event.aggregate_type,
            aggregate_id: event.aggregate_id,
            dealership_id: dealershipId,
            payload: event.payload,
          })}`,
        );
        await manager.query(`UPDATE outbox_event SET published_at = now(), last_error = NULL WHERE id = $1`, [
          event.id,
        ]);
        this.metrics.outboxEventsTotal.labels({ result: 'success' }).inc();
        success += 1;
      } catch (err) {
        const msg = (err as Error).message;
        await manager.query(
          `UPDATE outbox_event
              SET attempt_count = attempt_count + 1,
                  last_error = $2
            WHERE id = $1`,
          [event.id, msg.slice(0, 500)],
        );
        this.metrics.outboxEventsTotal.labels({ result: 'error' }).inc();
        this.logger.error(`outbox.failed event_id=${event.id} err=${msg}`);
      }
    }
    return success;
  }
}
