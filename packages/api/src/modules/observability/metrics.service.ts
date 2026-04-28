import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsService {
  // Phase 1 placeholder. Counters/histograms registered here become available
  // across the app. Future phases will inject specific metrics via
  // @InjectMetric() and call .inc()/.observe() directly.
}
