import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 003 — production-grade infrastructure tables.
 * Reference: design doc Section 9 (Reliability) + Appendix A.
 *
 * - idempotency_record: cache for POST creates, 24h TTL.
 * - outbox_event: transactional outbox pattern for at-least-once event publishing.
 */
export class CreateInfrastructure1700000000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ===== idempotency_record =====
    await queryRunner.query(`
      CREATE TABLE idempotency_record (
        key             text PRIMARY KEY,
        user_id         uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        request_hash    text NOT NULL,
        response_status int NOT NULL,
        response_body   jsonb NOT NULL,
        created_at      timestamptz NOT NULL DEFAULT now(),
        expires_at      timestamptz NOT NULL DEFAULT now() + interval '24 hours'
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_idempotency_expires ON idempotency_record (expires_at)`);

    // ===== outbox_event =====
    await queryRunner.query(`
      CREATE TABLE outbox_event (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id   uuid NOT NULL,
        aggregate_type  text NOT NULL,
        aggregate_id    uuid NOT NULL,
        event_type      text NOT NULL,
        payload         jsonb NOT NULL,
        occurred_at     timestamptz NOT NULL DEFAULT now(),
        published_at    timestamptz NULL,
        attempt_count   int NOT NULL DEFAULT 0,
        last_error      text NULL
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_outbox_unpublished ON outbox_event (occurred_at) WHERE published_at IS NULL`,
    );

    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON idempotency_record, outbox_event TO scheduler_app`,
    );

    // RLS: outbox is tenant-scoped; idempotency_record is user-scoped (no dealership_id, app-layer filter)
    await queryRunner.query(`ALTER TABLE outbox_event ENABLE ROW LEVEL SECURITY`);
    await queryRunner.query(`ALTER TABLE outbox_event FORCE ROW LEVEL SECURITY`);
    await queryRunner.query(`
      CREATE POLICY outbox_event_tenant_isolation ON outbox_event
        USING       (dealership_id::text = current_setting('app.current_dealership', true))
        WITH CHECK  (dealership_id::text = current_setting('app.current_dealership', true))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS outbox_event CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS idempotency_record CASCADE`);
  }
}
