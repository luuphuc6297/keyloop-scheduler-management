import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DealershipsController } from './controllers/dealerships.controller';
import { DealershipsService } from './services/dealerships.service';

@Module({
  imports: [AuthModule],
  controllers: [DealershipsController],
  providers: [DealershipsService],
  exports: [DealershipsService],
})
export class DealershipsModule {}
