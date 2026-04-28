import type { IncomingMessage, ServerResponse } from 'node:http';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule, type Params } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';
import { HealthModule } from './modules/health/health.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { RequestIdMiddleware } from './shared/middleware/request-id.middleware';

type RequestWithId = IncomingMessage & { id?: string | number };

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>): Params => {
        const isDev = config.get('NODE_ENV') === 'development';
        return {
          pinoHttp: {
            level: config.get('LOG_LEVEL'),
            redact: {
              paths: [
                'req.headers.authorization',
                'req.headers.cookie',
                'req.body.password',
                'req.body.refresh_token',
                '*.password_hash',
                '*.token_hash',
              ],
              censor: '[REDACTED]',
            },
            customProps: (req: IncomingMessage) => ({
              request_id: (req as RequestWithId).id,
            }),
            serializers: {
              req: (req: IncomingMessage) => ({
                method: req.method,
                url: req.url,
                request_id: (req as RequestWithId).id,
              }),
              res: (res: ServerResponse) => ({ status_code: res.statusCode }),
            },
            ...(isDev ? { transport: { target: 'pino-pretty', options: { singleLine: true } } } : {}),
          },
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        type: 'postgres' as const,
        url: config.get('DATABASE_URL'),
        entities: [],
        migrations: [],
        synchronize: false,
        logging: config.get('LOG_LEVEL') === 'debug' ? 'all' : ['error', 'warn'],
        cache: false,
      }),
    }),
    HealthModule,
    ObservabilityModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
