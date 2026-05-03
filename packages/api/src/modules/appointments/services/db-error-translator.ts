import { ConflictException, Injectable } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { MetricsService } from '../../observability/metrics.service';

const PG_EXCLUSION_VIOLATION = '23P01';
const PG_CHECK_VIOLATION = '23514';

@Injectable()
export class DbErrorTranslator {
  constructor(private readonly metrics: MetricsService) {}

  translate(err: unknown): Error {
    if (!(err instanceof QueryFailedError)) {
      return err as Error;
    }
    const driver = err.driverError as { code?: string; constraint?: string; detail?: string };

    if (driver.code === PG_EXCLUSION_VIOLATION) {
      return this.translateExclusionViolation(driver, err);
    }
    if (driver.code === PG_CHECK_VIOLATION) {
      return new ConflictException({
        code: 'INVALID_STATUS_TRANSITION',
        message: driver.detail ?? err.message,
      });
    }
    return err;
  }

  private translateExclusionViolation(
    driver: { constraint?: string },
    fallback: Error,
  ): Error {
    if (driver.constraint === 'appt_bay_no_overlap') {
      this.metrics.bookingsConflictTotal.labels({ resource: 'bay' }).inc();
      return new ConflictException({
        code: 'BAY_UNAVAILABLE',
        message: 'The requested bay is already booked for this time slot',
        conflictingResource: 'bay',
      });
    }
    if (driver.constraint === 'appt_technician_no_overlap') {
      this.metrics.bookingsConflictTotal.labels({ resource: 'technician' }).inc();
      return new ConflictException({
        code: 'TECHNICIAN_UNAVAILABLE',
        message: 'The technician is not available for this time slot',
        conflictingResource: 'technician',
      });
    }
    this.metrics.bookingsConflictTotal.labels({ resource: 'unknown' }).inc();
    return new ConflictException({ code: 'BOOKING_CONFLICT', message: fallback.message });
  }
}
