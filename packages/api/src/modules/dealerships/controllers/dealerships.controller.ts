import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { Tenant, type TenantContext } from '../../auth/decorators/tenant-context.decorator';

import { Roles } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import {
  DealershipsService,
  type BayResponse,
  type BusinessHoursResponse,
  type DealershipResponse,
  type ServiceTypeResponse,
  type TechnicianResponse,
} from '../services/dealerships.service';

@Controller('api/v1/dealerships/me')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DealershipsController {
  constructor(private readonly svc: DealershipsService) {}

  @Get()
  @Roles('service_advisor', 'manager', 'technician')
  async me(@Tenant() ctx: TenantContext): Promise<DealershipResponse> {
    return this.svc.findMe(ctx);
  }

  @Get('service-types')
  @Roles('service_advisor', 'manager', 'technician')
  @Header('Cache-Control', 'private, max-age=300')
  async serviceTypes(@Tenant() ctx: TenantContext): Promise<{ data: ServiceTypeResponse[] }> {
    const data = await this.svc.listServiceTypes(ctx);
    return { data };
  }

  @Get('technicians')
  @Roles('service_advisor', 'manager', 'technician')
  @Header('Cache-Control', 'private, max-age=300')
  async technicians(@Tenant() ctx: TenantContext): Promise<{ data: TechnicianResponse[] }> {
    const data = await this.svc.listTechnicians(ctx);
    return { data };
  }

  @Get('bays')
  @Roles('service_advisor', 'manager', 'technician')
  @Header('Cache-Control', 'private, max-age=300')
  async bays(@Tenant() ctx: TenantContext): Promise<{ data: BayResponse[] }> {
    const data = await this.svc.listBays(ctx);
    return { data };
  }

  @Get('business-hours')
  @Roles('service_advisor', 'manager', 'technician')
  @Header('Cache-Control', 'private, max-age=300')
  async businessHours(@Tenant() ctx: TenantContext): Promise<BusinessHoursResponse> {
    return this.svc.getBusinessHours(ctx);
  }
}
