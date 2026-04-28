import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckResult, HealthCheckService } from '@nestjs/terminus';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthCheckService) {}

  @Get('liveness')
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('readiness')
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    // DB indicator added in Task 13 (TypeORM setup)
    return this.health.check([]);
  }
}
