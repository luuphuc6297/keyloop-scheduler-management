import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AppointmentsController } from './controllers/appointments.controller';
import { IdempotencyRecord } from './entities/idempotency-record.entity';
import { AppointmentsService } from './services/appointments.service';
import { IdempotencyService } from './services/idempotency.service';

@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyRecord]), AuthModule],
  controllers: [AppointmentsController],
  providers: [AppointmentsService, IdempotencyService],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
