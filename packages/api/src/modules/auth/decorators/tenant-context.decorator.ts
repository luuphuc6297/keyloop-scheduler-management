import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '../types/auth-context';

export interface TenantContext {
  userId: string;
  dealershipId: string;
}

export const Tenant = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TenantContext => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthContext }>();
    const user = req.user;
    if (!user) {
      throw new Error('@Tenant() used on a request without an authenticated user');
    }
    return { userId: user.id, dealershipId: user.dealershipId };
  },
);
