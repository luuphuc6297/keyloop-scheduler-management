import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './controllers/appointments.controller';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { AppointmentsService } from './services/appointments.service';
import { AvailabilityService } from './services/availability.service';
import { IdempotencyService } from './services/idempotency.service';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord]), AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, AvailabilityService, IdempotencyService],
  exports: [AppointmentsService, AvailabilityService],
})
export class AppointmentsModule {}
