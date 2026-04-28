-- Postgres role architecture
-- Reference: design doc Section 7.4

-- Owner role: schema management, BYPASSRLS by default (owner of tables).
-- POSTGRES_USER from compose maps to scheduler_owner already; no creation here.

-- Migrator role: CI/CD pipeline. BYPASSRLS for migrations + seeds.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_migrator') THEN
    CREATE ROLE scheduler_migrator LOGIN PASSWORD 'migrator' BYPASSRLS;
  END IF;
END $$;
GRANT scheduler_owner TO scheduler_migrator;

-- App runtime role: NestJS process. NO BYPASSRLS — RLS-enforced.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_app') THEN
    CREATE ROLE scheduler_app LOGIN PASSWORD 'app';
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO scheduler_app;

-- Future tables and sequences will need GRANT statements; per-migration grants are fine.
