import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
  makeGaugeProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';
import { HttpMetricsInterceptor } from './http-metrics.interceptor';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      defaultLabels: { app: 'scheduler-api' },
    }),
  ],
  providers: [
    MetricsService,
    HttpMetricsInterceptor,
    // ===== HTTP =====
    makeHistogramProvider({
      name: 'http_request_duration_seconds',
      help: 'HTTP request duration in seconds',
      labelNames: ['method', 'route', 'status'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    }),
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total HTTP requests by method, route, and status',
      labelNames: ['method', 'route', 'status'],
    }),
    // ===== Domain =====
    makeCounterProvider({
      name: 'appointments_created_total',
      help: 'Successful appointment bookings',
      labelNames: ['dealership_id'],
    }),
    makeCounterProvider({
      name: 'appointments_status_transition_total',
      help: 'Appointment status transitions (e.g. confirmed→cancelled)',
      labelNames: ['from', 'to'],
    }),
    makeCounterProvider({
      name: 'bookings_conflict_total',
      help: 'Booking conflicts mapped from Postgres EXCLUDE violations',
      labelNames: ['resource'],
    }),
    makeHistogramProvider({
      name: 'booking_duration_seconds',
      help: 'Wall-clock duration of book() service calls',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    }),
    makeHistogramProvider({
      name: 'availability_query_duration_seconds',
      help: 'Wall-clock duration of availability lookups',
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
    }),
    makeCounterProvider({
      name: 'optimistic_lock_failures_total',
      help: 'Reschedule/cancel attempts rejected due to stale If-Match version',
    }),
    makeCounterProvider({
      name: 'dst_validation_failures_total',
      help: 'Bookings rejected for invalid local time across DST',
    }),
    makeCounterProvider({
      name: 'gdpr_anonymization_total',
      help: 'GDPR anonymize requests successfully applied',
    }),
    // ===== Auth =====
    makeCounterProvider({
      name: 'auth_login_attempts_total',
      help: 'Login attempts by outcome',
      labelNames: ['outcome'], // success | invalid_credentials | locked
    }),
    makeCounterProvider({
      name: 'accounts_locked_total',
      help: 'Times an account was locked due to repeated failed logins',
    }),
    makeCounterProvider({
      name: 'auth_refresh_token_reuse_total',
      help: 'Refresh-token reuse attempts (security signal)',
    }),
    // ===== Limits / Outbox =====
    makeCounterProvider({
      name: 'rate_limit_exceeded_total',
      help: 'Requests rejected by the throttler',
      labelNames: ['route'],
    }),
    makeCounterProvider({
      name: 'idempotency_cache_total',
      help: 'Idempotency cache outcome (hit, miss, conflict)',
      labelNames: ['result'],
    }),
    makeCounterProvider({
      name: 'outbox_events_total',
      help: 'Outbox publish outcomes',
      labelNames: ['result'], // success | error
    }),
    makeGaugeProvider({
      name: 'outbox_lag_seconds',
      help: 'Age of the oldest unpublished outbox event',
    }),
  ],
  exports: [MetricsService, HttpMetricsInterceptor],
})
export class ObservabilityModule {}
