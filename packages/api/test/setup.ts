// Test setup — sane defaults for env vars when missing.
// Loaded before the test framework via jest.config.ts setupFiles.
process.env.NODE_ENV = process.env.NODE_ENV ?? 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'a'.repeat(32);
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET ?? 'b'.repeat(32);
process.env.CORS_ALLOWED_ORIGINS = process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:3000';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
// In tests, use owner connection (BYPASSRLS) so fixture setup is unrestricted.
// RLS-specific tests opt into scheduler_app explicitly via Testcontainers.
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://scheduler_owner:owner@localhost:5432/scheduler';
process.env.DATABASE_URL_MIGRATIONS =
  process.env.DATABASE_URL_MIGRATIONS ?? 'postgresql://scheduler_owner:owner@localhost:5432/scheduler';
process.env.OTLP_ENDPOINT = process.env.OTLP_ENDPOINT ?? '';
process.env.APP_VERSION = process.env.APP_VERSION ?? 'test';
