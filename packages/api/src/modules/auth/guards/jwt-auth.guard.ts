import { type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

// `/metrics` is registered by the @willsoto/nestjs-prometheus library; we
// can't decorate that controller with @Public(). Single-path escape hatch.
const LIBRARY_PUBLIC_PATHS = ['/metrics'];

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<{ url?: string }>();
    if (LIBRARY_PUBLIC_PATHS.includes(req.url ?? '')) return true;

    return super.canActivate(context);
  }
}
