import { Module } from '@nestjs/common';
import { ObservabilityModule } from '../observability/observability.module';
import { OutboxPublisherService } from './services/outbox-publisher.service';

@Module({
  imports: [ObservabilityModule],
  providers: [OutboxPublisherService],
  exports: [OutboxPublisherService],
})
export class OutboxModule {}
