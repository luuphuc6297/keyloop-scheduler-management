import type { IncomingMessage, ServerResponse } from 'node:http';
import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule, type Params } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';
import { AppointmentsModule } from './modules/appointments/appointments.module';
import { AuthModule } from './modules/auth/auth.module';
import { JwtAuthGuard } from './modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth/guards/roles.guard';
import { CustomersModule } from './modules/customers/customers.module';
import { DealershipsModule } from './modules/dealerships/dealerships.module';
import { HealthModule } from './modules/health/health.module';
import { HttpMetricsInterceptor } from './modules/observability/http-metrics.interceptor';
import { ObservabilityModule } from './modules/observability/observability.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { VehiclesModule } from './modules/vehicles/vehicles.module';
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
        autoLoadEntities: true,
        migrations: [],
        synchronize: false,
        logging: config.get('LOG_LEVEL') === 'debug' ? 'all' : ['error', 'warn'],
        cache: false,
      }),
    }),
    ThrottlerModule.forRoot([
      // Default tiers — apply to every route unless overridden
      { name: 'short', ttl: 1_000, limit: 20 },
      { name: 'medium', ttl: 60_000, limit: 100 },
      // Tighter named tiers — opt-in via @Throttle({ <name>: ... }) on specific endpoints.
      // (Per-endpoint overrides are wired in the controllers; see also the
      // RateLimitInterceptor which records 429 responses to the
      // rate_limit_exceeded_total counter.)
      { name: 'login', ttl: 15 * 60_000, limit: 5 }, // /auth/login: 5 / 15 min
      { name: 'refresh', ttl: 5 * 60_000, limit: 10 }, // /auth/refresh: 10 / 5 min
      { name: 'book', ttl: 60_000, limit: 30 }, // POST /appointments: 30 / min
    ]),
    AuthModule,
    AppointmentsModule,
    CustomersModule,
    DealershipsModule,
    HealthModule,
    ObservabilityModule,
    OutboxModule,
    VehiclesModule,
  ],
  controllers: [],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
