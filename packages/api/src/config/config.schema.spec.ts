import { configSchema } from './config.schema';

describe('configSchema', () => {
  const validBase = {
    NODE_ENV: 'development',
    PORT: '3001',
    DATABASE_URL: 'postgresql://app:app@localhost:5432/scheduler',
    DATABASE_URL_MIGRATIONS: 'postgresql://owner:owner@localhost:5432/scheduler',
    REDIS_URL: 'redis://localhost:6379',
    LOG_LEVEL: 'info',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    CORS_ALLOWED_ORIGINS: 'http://localhost:3000',
    APP_VERSION: 'dev',
  };

  it('accepts a valid config and parses PORT to number', () => {
    const result = configSchema.parse(validBase);
    expect(result.PORT).toBe(3001);
    expect(typeof result.PORT).toBe('number');
  });

  it('rejects too-short JWT_ACCESS_SECRET', () => {
    expect(() => configSchema.parse({ ...validBase, JWT_ACCESS_SECRET: 'short' })).toThrow();
  });

  it('rejects invalid DATABASE_URL', () => {
    expect(() => configSchema.parse({ ...validBase, DATABASE_URL: 'not-a-url' })).toThrow();
  });

  it('defaults LOG_LEVEL to info when missing', () => {
    const { LOG_LEVEL: _omitted, ...rest } = validBase;
    const result = configSchema.parse(rest);
    expect(result.LOG_LEVEL).toBe('info');
  });
});
