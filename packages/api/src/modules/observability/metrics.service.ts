import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge, Histogram } from 'prom-client';

/**
 * Centralized metric handles. The actual metric registration happens in
 * `observability.module.ts` via `makeCounterProvider` / `makeHistogramProvider`
 * / `makeGaugeProvider`.
 *
 * Naming: snake_case per Prometheus convention.
 *   - `_total`     for monotonic counters
 *   - `_seconds`   for histograms with seconds unit
 *   - bare names   for gauges (instantaneous values)
 */
@Injectable()
export class MetricsService {
  constructor(
    // ===== HTTP =====
    @InjectMetric('http_request_duration_seconds')
    readonly httpRequestDuration: Histogram<string>,
    @InjectMetric('http_requests_total')
    readonly httpRequestsTotal: Counter<string>,
    // ===== Domain =====
    @InjectMetric('appointments_created_total')
    readonly appointmentsCreatedTotal: Counter<string>,
    @InjectMetric('appointments_status_transition_total')
    readonly appointmentsStatusTransitionTotal: Counter<string>,
    @InjectMetric('bookings_conflict_total')
    readonly bookingsConflictTotal: Counter<string>,
    @InjectMetric('booking_duration_seconds')
    readonly bookingDuration: Histogram<string>,
    @InjectMetric('availability_query_duration_seconds')
    readonly availabilityQueryDuration: Histogram<string>,
    @InjectMetric('optimistic_lock_failures_total')
    readonly optimisticLockFailuresTotal: Counter<string>,
    @InjectMetric('dst_validation_failures_total')
    readonly dstValidationFailuresTotal: Counter<string>,
    @InjectMetric('gdpr_anonymization_total')
    readonly gdprAnonymizationTotal: Counter<string>,
    // ===== Auth =====
    @InjectMetric('auth_login_attempts_total')
    readonly authLoginAttemptsTotal: Counter<string>,
    @InjectMetric('accounts_locked_total')
    readonly accountsLockedTotal: Counter<string>,
    @InjectMetric('auth_refresh_token_reuse_total')
    readonly authRefreshTokenReuseTotal: Counter<string>,
    // ===== Limits / Outbox =====
    @InjectMetric('rate_limit_exceeded_total')
    readonly rateLimitExceededTotal: Counter<string>,
    @InjectMetric('idempotency_cache_total')
    readonly idempotencyCacheTotal: Counter<string>,
    @InjectMetric('outbox_events_total')
    readonly outboxEventsTotal: Counter<string>,
    @InjectMetric('outbox_lag_seconds')
    readonly outboxLagSeconds: Gauge<string>,
  ) {}
}
