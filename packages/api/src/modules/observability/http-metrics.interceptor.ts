import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';
import { MetricsService } from './metrics.service';

/**
 * Records http_request_duration_seconds + http_requests_total for every HTTP
 * request that completes (success or error). Uses the controller's route path
 * (e.g. `/api/v1/appointments/:id`) rather than the concrete URL so cardinality
 * stays bounded.
 */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: MetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const start = process.hrtime.bigint();
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { route?: { path?: string } }>();
    const res = http.getResponse<Response>();
    const method = req.method;

    const record = (status: number) => {
      const route = req.route?.path ?? req.url ?? 'unknown';
      const duration = Number(process.hrtime.bigint() - start) / 1e9;
      this.metrics.httpRequestDuration.labels({ method, route, status: String(status) }).observe(duration);
      this.metrics.httpRequestsTotal.labels({ method, route, status: String(status) }).inc();
      if (status === 429) {
        this.metrics.rateLimitExceededTotal.labels({ route }).inc();
      }
    };

    return next.handle().pipe(
      tap({
        error: (err: unknown) => {
          const status =
            (err as { status?: number; getStatus?: () => number })?.getStatus?.() ??
            (err as { status?: number })?.status ??
            500;
          record(status);
        },
        complete: () => {
          // 'finish' fires after the response body is flushed. If already
          // ended (e.g. interceptor unwinds after Express finishes), record now.
          if (res.writableEnded) {
            record(res.statusCode);
          } else {
            res.once('finish', () => record(res.statusCode));
          }
        },
      }),
    );
  }
}
