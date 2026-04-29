import { BadRequestException, Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import type { AuthContext } from '../../auth/types/auth-context';
import {
  type AppointmentResponse,
  type BookAppointmentDto,
  BookAppointmentSchema,
} from '../dtos/book-appointment.schema';
import { AppointmentsService } from '../services/appointments.service';
import { IdempotencyService } from '../services/idempotency.service';

@Controller('api/v1/appointments')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppointmentsController {
  constructor(
    private readonly appointments: AppointmentsService,
    private readonly idempotency: IdempotencyService,
  ) {}

  @Post()
  @Roles('service_advisor', 'manager')
  async book(
    @Body(new ZodValidationPipe(BookAppointmentSchema)) dto: BookAppointmentDto,
    @CurrentUser() user: AuthContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
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
      return cached.body as unknown as AppointmentResponse;
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

    return response;
  }
}
