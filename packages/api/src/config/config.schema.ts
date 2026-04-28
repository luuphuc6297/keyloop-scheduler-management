import { z } from 'zod';

export const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  DATABASE_URL: z.string().url(),
  DATABASE_URL_MIGRATIONS: z.string().url(),
  REDIS_URL: z.string().url(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  OTLP_ENDPOINT: z.string().optional().default(''),
  CORS_ALLOWED_ORIGINS: z.string().min(1),
  APP_VERSION: z.string().default('dev'),
});

export type AppConfig = z.infer<typeof configSchema>;
