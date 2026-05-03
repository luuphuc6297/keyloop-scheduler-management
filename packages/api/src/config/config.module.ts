import * as path from 'node:path';
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configSchema } from './config.schema';

// The .env file lives at the monorepo root, but `pnpm --filter @keyloop/api dev`
// runs with cwd=packages/api. Resolve from this file so it works regardless of cwd.
// __dirname at runtime is `packages/api/dist/config` (compiled) or
// `packages/api/src/config` (ts-node). Either way, ../../../../.env resolves to
// the repo root.
const envFilePath = [
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(process.cwd(), '.env'), // fallback for tests / scripts that run from repo root
];

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      isGlobal: true,
      envFilePath,
      validate: (raw: Record<string, unknown>): Record<string, unknown> => {
        const parsed = configSchema.safeParse(raw);
        if (!parsed.success) {
          const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n  ');
          throw new Error(`Invalid environment configuration:\n  ${issues}`);
        }
        return parsed.data as Record<string, unknown>;
      },
    }),
  ],
})
export class ConfigModule {}
