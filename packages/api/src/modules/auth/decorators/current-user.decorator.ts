import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext } from '../types/auth-context';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthContext }>();
    return req.user;
  },
);
