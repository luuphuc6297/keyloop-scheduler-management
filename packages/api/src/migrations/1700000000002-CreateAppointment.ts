import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 002 — appointment + appointment_history + EXCLUDE constraints + triggers + RLS.
 * The technical heart of the design. Reference: design doc Section 6 + Appendix A.
 *
 * Key features:
 * - 2 partial EXCLUDE constraints (bay_id, technician_id) WHERE status='confirmed'
 *   → cancelled appointments do not block re-booking.
 * - Status FSM trigger: only 'confirmed' is non-terminal.
 * - Optimistic-locking version trigger: increments on meaningful UPDATEs.
 * - Half-open tstzrange: [start, end) so 10:30 service does not conflict with 10:30 start.
 */
export class CreateAppointment1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Status enum
    await queryRunner.query(`
      CREATE TYPE appointment_status AS ENUM ('confirmed', 'completed', 'cancelled', 'no_show')
    `);

    // ===== appointment =====
    await queryRunner.query(`
      CREATE TABLE appointment (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id   uuid NOT NULL REFERENCES dealership(id)   ON DELETE RESTRICT,
        customer_id     uuid NOT NULL REFERENCES customer(id)     ON DELETE RESTRICT,
        vehicle_id      uuid NOT NULL REFERENCES vehicle(id)      ON DELETE RESTRICT,
        service_type_id uuid NOT NULL REFERENCES service_type(id) ON DELETE RESTRICT,
        technician_id   uuid NOT NULL REFERENCES technician(id)   ON DELETE RESTRICT,
        bay_id          uuid NOT NULL REFERENCES bay(id)          ON DELETE RESTRICT,
        time_range      tstzrange NOT NULL,
        status          appointment_status NOT NULL DEFAULT 'confirmed',
        version         int NOT NULL DEFAULT 1,
        created_by      uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now(),

        CONSTRAINT appt_range_nonempty   CHECK (NOT isempty(time_range)),
        CONSTRAINT appt_range_bounded    CHECK (lower(time_range) IS NOT NULL AND upper(time_range) IS NOT NULL),
        CONSTRAINT appt_range_half_open  CHECK (lower_inc(time_range) AND NOT upper_inc(time_range)),
        CONSTRAINT appt_range_min_dur    CHECK (upper(time_range) - lower(time_range) >= interval '1 minute'),

        CONSTRAINT appt_bay_no_overlap
          EXCLUDE USING gist (bay_id WITH =, time_range WITH &&)
          WHERE (status = 'confirmed'),
        CONSTRAINT appt_technician_no_overlap
          EXCLUDE USING gist (technician_id WITH =, time_range WITH &&)
          WHERE (status = 'confirmed')
      )
    `);

    // Indexes (beyond what EXCLUDE auto-creates)
    await queryRunner.query(`
      CREATE INDEX idx_appt_dealership_range
        ON appointment USING gist (dealership_id, time_range)
        WHERE status = 'confirmed'
    `);
    await queryRunner.query(`
      CREATE INDEX idx_appt_customer_recent
        ON appointment (customer_id, lower(time_range) DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_appt_vehicle_recent
        ON appointment (vehicle_id, lower(time_range) DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_appt_technician_range
        ON appointment USING gist (technician_id, time_range)
        WHERE status = 'confirmed'
    `);

    // updated_at trigger
    await queryRunner.query(`
      CREATE TRIGGER trg_appt_updated_at BEFORE UPDATE ON appointment
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // Status FSM trigger
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION enforce_appointment_status_fsm() RETURNS TRIGGER AS $$
      BEGIN
        IF OLD.status = NEW.status THEN
          RETURN NEW;
        END IF;
        IF OLD.status <> 'confirmed' THEN
          RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = format('Invalid status transition: %s -> %s (only confirmed is non-terminal)', OLD.status, NEW.status);
        END IF;
        IF NEW.status NOT IN ('completed', 'cancelled', 'no_show') THEN
          RAISE EXCEPTION USING
            ERRCODE = 'check_violation',
            MESSAGE = format('Invalid target status: %s', NEW.status);
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_appt_status_fsm BEFORE UPDATE OF status ON appointment
        FOR EACH ROW EXECUTE FUNCTION enforce_appointment_status_fsm()
    `);

    // Version-increment trigger (optimistic locking)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION increment_appointment_version() RETURNS TRIGGER AS $$
      BEGIN NEW.version := OLD.version + 1; RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_appt_version BEFORE UPDATE ON appointment
        FOR EACH ROW WHEN (OLD.* IS DISTINCT FROM NEW.*)
        EXECUTE FUNCTION increment_appointment_version()
    `);

    // ===== appointment_history (audit) =====
    await queryRunner.query(`
      CREATE TABLE appointment_history (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        appointment_id  uuid NOT NULL REFERENCES appointment(id) ON DELETE RESTRICT,
        dealership_id   uuid NOT NULL,
        field           text NOT NULL,
        old_value       jsonb,
        new_value       jsonb,
        changed_by      uuid NOT NULL REFERENCES app_user(id) ON DELETE RESTRICT,
        changed_at      timestamptz NOT NULL DEFAULT now(),
        reason          text
      )
    `);
    await queryRunner.query(`
      CREATE INDEX idx_appt_history_appointment
        ON appointment_history (appointment_id, changed_at DESC)
    `);

    // Grants
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON appointment, appointment_history TO scheduler_app`,
    );

    // RLS on appointment + appointment_history
    for (const table of ['appointment', 'appointment_history']) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      await queryRunner.query(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
          USING       (dealership_id::text = current_setting('app.current_dealership', true))
          WITH CHECK  (dealership_id::text = current_setting('app.current_dealership', true))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS appointment_history CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS appointment CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS enforce_appointment_status_fsm() CASCADE`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS increment_appointment_version() CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS appointment_status`);
  }
}
