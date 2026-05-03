import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { ObservabilityModule } from '../observability/observability.module';
import { AppointmentsController } from './controllers/appointments.controller';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { AppointmentHistoryRecorder } from './services/appointment-history-recorder';
import { AppointmentsService } from './services/appointments.service';
import { AvailabilityService } from './services/availability.service';
import { DbErrorTranslator } from './services/db-error-translator';
import { IdempotencyService } from './services/idempotency.service';
import { OutboxEmitter } from './services/outbox-emitter';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord]), AuthModule, ObservabilityModule],
  controllers: [AppointmentsController],
  providers: [
    AppointmentsService,
    AvailabilityService,
    IdempotencyService,
    AppointmentHistoryRecorder,
    OutboxEmitter,
    DbErrorTranslator,
  ],
  exports: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
