import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { configSchema } from './config.schema';

@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      cache: true,
      isGlobal: true,
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
