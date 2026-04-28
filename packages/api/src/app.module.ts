import type { IncomingMessage, ServerResponse } from 'node:http';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule, type Params } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import type { AppConfig } from './config/config.schema';

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
            ...(isDev
              ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
              : {}),
          },
        };
      },
    }),
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
