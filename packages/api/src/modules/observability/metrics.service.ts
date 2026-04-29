import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

/**
 * Centralized metric handles. The actual metric registration happens in
 * `observability.module.ts` via `makeCounterProvider` / `makeHistogramProvider`.
 *
 * Naming: snake_case per Prometheus convention. Suffixes:
 *   - `_total`     for monotonic counters
 *   - `_seconds`   for histograms with seconds unit
 */
@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('http_request_duration_seconds')
    readonly httpRequestDuration: Histogram<string>,
    @InjectMetric('http_requests_total')
    readonly httpRequestsTotal: Counter<string>,
    @InjectMetric('appointments_created_total')
    readonly appointmentsCreatedTotal: Counter<string>,
    @InjectMetric('bookings_conflict_total')
    readonly bookingsConflictTotal: Counter<string>,
    @InjectMetric('idempotency_cache_total')
    readonly idempotencyCacheTotal: Counter<string>,
  ) {}
}
