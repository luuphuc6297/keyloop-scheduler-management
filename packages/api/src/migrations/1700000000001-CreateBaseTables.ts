import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration 001 — Base tables (no appointment yet).
 * Creates: extensions, dealership, auth (app_user, refresh_token, failed_login_attempt),
 * catalog (customer, vehicle, skill, technician, technician_skill, bay, service_type),
 * schedule (technician_shift, technician_time_off, business_hours, business_hours_exception).
 * Enables RLS on tenant-scoped tables. Reference: design doc Appendix A.
 */
export class CreateBaseTables1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Extensions (idempotent)
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS btree_gist`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    // ===== dealership =====
    await queryRunner.query(`
      CREATE TABLE dealership (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name        text NOT NULL,
        timezone    text NOT NULL,
        created_at  timestamptz NOT NULL DEFAULT now(),
        updated_at  timestamptz NOT NULL DEFAULT now()
      )
    `);

    // updated_at maintenance trigger (reusable)
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
      BEGIN NEW.updated_at := now(); RETURN NEW; END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_dealership_updated_at BEFORE UPDATE ON dealership
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== app_user =====
    await queryRunner.query(`
      CREATE TABLE app_user (
        id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id       uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        email               citext NOT NULL UNIQUE,
        password_hash       text NOT NULL,
        roles               text[] NOT NULL DEFAULT '{}',
        failed_login_count  int NOT NULL DEFAULT 0,
        locked_until        timestamptz NULL,
        created_at          timestamptz NOT NULL DEFAULT now(),
        updated_at          timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_app_user_updated_at BEFORE UPDATE ON app_user
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== refresh_token =====
    await queryRunner.query(`
      CREATE TABLE refresh_token (
        id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id     uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
        token_hash  text NOT NULL UNIQUE,
        family_id   uuid NOT NULL,
        issued_at   timestamptz NOT NULL DEFAULT now(),
        expires_at  timestamptz NOT NULL,
        revoked_at  timestamptz NULL,
        user_agent  text,
        ip_address  inet
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_refresh_token_user ON refresh_token (user_id) WHERE revoked_at IS NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_refresh_token_hash ON refresh_token (token_hash) WHERE revoked_at IS NULL`,
    );

    // ===== failed_login_attempt =====
    await queryRunner.query(`
      CREATE TABLE failed_login_attempt (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email         citext NOT NULL,
        attempted_at  timestamptz NOT NULL DEFAULT now(),
        ip_address    inet,
        user_agent    text
      )
    `);
    await queryRunner.query(
      `CREATE INDEX idx_failed_login_email_recent ON failed_login_attempt (email, attempted_at DESC)`,
    );

    // ===== customer =====
    await queryRunner.query(`
      CREATE TABLE customer (
        id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id            uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        first_name               text NOT NULL,
        last_name                text NOT NULL,
        email                    citext,
        phone                    text,
        anonymized_at            timestamptz NULL,
        anonymization_reason     text NULL,
        created_at               timestamptz NOT NULL DEFAULT now(),
        updated_at               timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_customer_updated_at BEFORE UPDATE ON customer
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== vehicle =====
    await queryRunner.query(`
      CREATE TABLE vehicle (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        customer_id   uuid NOT NULL REFERENCES customer(id) ON DELETE RESTRICT,
        vin           text NOT NULL UNIQUE,
        make          text NOT NULL,
        model         text NOT NULL,
        year          int NOT NULL,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_vehicle_updated_at BEFORE UPDATE ON vehicle
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== skill =====
    await queryRunner.query(`
      CREATE TABLE skill (
        id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code  text NOT NULL UNIQUE,
        name  text NOT NULL
      )
    `);

    // ===== service_type =====
    await queryRunner.query(`
      CREATE TABLE service_type (
        id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id     uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        name              text NOT NULL,
        duration_minutes  int  NOT NULL CHECK (duration_minutes > 0),
        buffer_minutes    int  NOT NULL DEFAULT 0 CHECK (buffer_minutes >= 0),
        required_skill_id uuid NULL REFERENCES skill(id) ON DELETE SET NULL,
        created_at        timestamptz NOT NULL DEFAULT now(),
        updated_at        timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_service_type_updated_at BEFORE UPDATE ON service_type
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== bay =====
    await queryRunner.query(`
      CREATE TABLE bay (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        name          text NOT NULL,
        is_active     boolean NOT NULL DEFAULT true,
        created_at    timestamptz NOT NULL DEFAULT now(),
        updated_at    timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_bay_updated_at BEFORE UPDATE ON bay
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== technician =====
    await queryRunner.query(`
      CREATE TABLE technician (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id   uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        first_name      text NOT NULL,
        last_name       text NOT NULL,
        employee_code   text NOT NULL,
        is_active       boolean NOT NULL DEFAULT true,
        created_at      timestamptz NOT NULL DEFAULT now(),
        updated_at      timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TRIGGER trg_technician_updated_at BEFORE UPDATE ON technician
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ===== technician_skill (junction) =====
    await queryRunner.query(`
      CREATE TABLE technician_skill (
        technician_id  uuid NOT NULL REFERENCES technician(id) ON DELETE CASCADE,
        skill_id       uuid NOT NULL REFERENCES skill(id) ON DELETE RESTRICT,
        PRIMARY KEY (technician_id, skill_id)
      )
    `);

    // ===== technician_shift =====
    await queryRunner.query(`
      CREATE TABLE technician_shift (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        technician_id uuid NOT NULL REFERENCES technician(id) ON DELETE CASCADE,
        day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        shift_start   time NOT NULL,
        shift_end     time NOT NULL CHECK (shift_end > shift_start),
        UNIQUE (technician_id, day_of_week)
      )
    `);

    // ===== technician_time_off =====
    await queryRunner.query(`
      CREATE TABLE technician_time_off (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        technician_id uuid NOT NULL REFERENCES technician(id) ON DELETE CASCADE,
        date_range    daterange NOT NULL,
        reason        text,
        EXCLUDE USING gist (technician_id WITH =, date_range WITH &&)
      )
    `);

    // ===== business_hours =====
    await queryRunner.query(`
      CREATE TABLE business_hours (
        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        day_of_week   smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
        open_time     time NOT NULL,
        close_time    time NOT NULL CHECK (close_time > open_time),
        UNIQUE (dealership_id, day_of_week)
      )
    `);

    // ===== business_hours_exception =====
    await queryRunner.query(`
      CREATE TABLE business_hours_exception (
        id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        dealership_id   uuid NOT NULL REFERENCES dealership(id) ON DELETE RESTRICT,
        date            date NOT NULL,
        is_closed       boolean NOT NULL DEFAULT true,
        override_open   time NULL,
        override_close  time NULL,
        reason          text,
        UNIQUE (dealership_id, date),
        CHECK (
          (is_closed AND override_open IS NULL AND override_close IS NULL) OR
          (NOT is_closed AND override_open IS NOT NULL AND override_close IS NOT NULL)
        )
      )
    `);

    // ===== Grants for app role =====
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scheduler_app`,
    );
    await queryRunner.query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO scheduler_app`);

    // ===== RLS on tenant-scoped tables (dealership_id present) =====
    const tenantTables = [
      'dealership',
      'customer',
      'vehicle',
      'service_type',
      'bay',
      'technician',
      'business_hours',
      'business_hours_exception',
    ];
    for (const table of tenantTables) {
      await queryRunner.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);
      await queryRunner.query(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
      const idCol = table === 'dealership' ? 'id' : 'dealership_id';
      await queryRunner.query(`
        CREATE POLICY ${table}_tenant_isolation ON ${table}
          USING       (${idCol}::text = current_setting('app.current_dealership', true))
          WITH CHECK  (${idCol}::text = current_setting('app.current_dealership', true))
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'business_hours_exception',
      'business_hours',
      'technician_time_off',
      'technician_shift',
      'technician_skill',
      'technician',
      'bay',
      'service_type',
      'skill',
      'vehicle',
      'customer',
      'failed_login_attempt',
      'refresh_token',
      'app_user',
      'dealership',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t} CASCADE`);
    }
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at() CASCADE`);
  }
}
