import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsService } from './metrics.service';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: { enabled: true },
      defaultLabels: { app: 'scheduler-api' },
    }),
  ],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class ObservabilityModule {}
