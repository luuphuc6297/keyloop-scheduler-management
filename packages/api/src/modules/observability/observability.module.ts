import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
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
    makeCounterProvider({
      name: 'appointments_created_total',
      help: 'Successful appointment bookings',
      labelNames: ['dealership_id'],
    }),
    makeCounterProvider({
      name: 'bookings_conflict_total',
      help: 'Booking conflicts mapped from Postgres EXCLUDE violations',
      labelNames: ['resource'],
    }),
    makeCounterProvider({
      name: 'idempotency_cache_total',
      help: 'Idempotency cache outcome (hit, miss, conflict)',
      labelNames: ['result'],
    }),
  ],
  exports: [MetricsService, HttpMetricsInterceptor],
})
export class ObservabilityModule {}
