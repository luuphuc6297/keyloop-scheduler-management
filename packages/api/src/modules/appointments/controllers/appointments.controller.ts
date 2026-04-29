import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthContext } from '../../auth/types/auth-context';
import { AvailabilityQuerySchema, type AvailabilityQuery } from '../dtos/availability.schema';
import {
  type AppointmentResponse,
  type BookAppointmentDto,
  BookAppointmentSchema,
} from '../dtos/book-appointment.schema';
import {
  ListAppointmentsSchema,
  type ListAppointmentsQuery,
} from '../dtos/list-appointments.schema';
import {
  RescheduleAppointmentSchema,
  type RescheduleAppointmentDto,
} from '../dtos/reschedule-appointment.schema';
import {
  AppointmentsService,
  type AppointmentHistoryRow,
  type ListResult,
} from '../services/appointments.service';
import { AvailabilityService } from '../services/availability.service';
import { IdempotencyService } from '../services/idempotency.service';

@Controller('api/v1/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly availability: AvailabilityService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @Roles('service_advisor', 'manager')
  // 30 bookings per minute per IP — preserves DB throughput for non-abusive
  // bursts; combined with idempotency means accidental retries are safe.
  @Throttle({ book: { ttl: 60_000, limit: 30 } })
  async book(
    @Body(new ZodValidationPipe(BookAppointmentSchema)) dto: BookAppointmentDto,
    @CurrentUser() user: AuthContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AppointmentResponse> {
    if (!idempotencyKey) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'Idempotency-Key header is required for POST /appointments',
      });
    }

    const requestHash = IdempotencyService.hashRequest(dto);
    const cached = await this.idempotency.get(idempotencyKey, user.id, requestHash);
    if (cached) {
      const body = cached.body as unknown as AppointmentResponse;
      res.setHeader('ETag', etagOf(body));
      return body;
    }

    const response = await this.appointments.book(dto, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });

    await this.idempotency.put(
      idempotencyKey,
      user.id,
      requestHash,
      201,
      response as unknown as Record<string, unknown>,
    );

    res.setHeader('ETag', etagOf(response));
    return response;
  }

  @Get()
  @Roles('service_advisor', 'manager', 'technician')
  async list(
    @Query(new ZodValidationPipe(ListAppointmentsSchema)) query: ListAppointmentsQuery,
    @CurrentUser() user: AuthContext,
  ): Promise<ListResult> {
    return this.appointments.list(query, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });
  }

  @Get('availability')
  @Roles('service_advisor', 'manager', 'technician')
  async availabilityRoute(
    @Query(new ZodValidationPipe(AvailabilityQuerySchema)) query: AvailabilityQuery,
    @CurrentUser() user: AuthContext,
  ) {
    const slots = await this.availability.findSlots(query, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });
    return { data: slots };
  }

  @Get(':id')
  @Roles('service_advisor', 'manager', 'technician')
  async detail(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthContext,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AppointmentResponse | undefined> {
    const found = await this.appointments.findById(id, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });
    const etag = etagOf(found);
    if (ifNoneMatch && stripWeakAndQuotes(ifNoneMatch) === stripWeakAndQuotes(etag)) {
      res.status(304);
      res.setHeader('ETag', etag);
      return undefined;
    }
    res.setHeader('ETag', etag);
    return found;
  }

  @Get(':id/history')
  @Roles('service_advisor', 'manager', 'technician')
  async history(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthContext,
  ): Promise<{ data: AppointmentHistoryRow[] }> {
    const data = await this.appointments.history(id, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });
    return { data };
  }

  @Patch(':id')
  @Roles('service_advisor', 'manager')
  async reschedule(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(RescheduleAppointmentSchema)) dto: RescheduleAppointmentDto,
    @CurrentUser() user: AuthContext,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AppointmentResponse> {
    const expectedVersion = parseIfMatch(ifMatch);
    const updated = await this.appointments.reschedule(id, dto, expectedVersion, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });
    res.setHeader('ETag', etagOf(updated));
    return updated;
  }

  @Delete(':id')
  @Roles('service_advisor', 'manager')
  async cancel(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: AuthContext,
    @Headers('if-match') ifMatch: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AppointmentResponse> {
    const expectedVersion = parseIfMatch(ifMatch);
    const cancelled = await this.appointments.cancel(id, expectedVersion, {
      userId: user.id,
      dealershipId: user.dealershipId,
    });
    res.setHeader('ETag', etagOf(cancelled));
    return cancelled;
  }
}

function etagOf(resource: { version: number }): string {
  return `"${resource.version}"`;
}

function parseIfMatch(header: string | undefined): number {
  if (!header) {
    throw new BadRequestException({
      code: 'IF_MATCH_REQUIRED',
      message: 'If-Match header is required',
    });
  }
  const stripped = stripWeakAndQuotes(header);
  const parsed = Number(stripped);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 1) {
    throw new BadRequestException({
      code: 'IF_MATCH_INVALID',
      message: `Could not parse version from If-Match: ${header}`,
    });
  }
  return parsed;
}

function stripWeakAndQuotes(etag: string): string {
  return etag.replace(/^W\//, '').replace(/^"|"$/g, '');
}
