import { Body, Controller, Get, HttpCode, HttpStatus, Headers, Ip, Post } from '@nestjs/common';
import { ZodValidationPipe } from '../../../shared/pipes/zod-validation.pipe';
import { CurrentUser } from '../decorators/current-user.decorator';
import { Public } from '../decorators/public.decorator';
import { AuthService, type ClientMeta } from '../services/auth.service';
import { type LoginDto, LoginSchema, type RefreshDto, RefreshSchema } from '../dtos/login.schema';
import type { AuthContext, TokenPair } from '../types/auth-context';

function buildMeta(userAgent: string | undefined, ipAddress: string): ClientMeta {
  const meta: ClientMeta = { ipAddress };
  if (userAgent !== undefined) meta.userAgent = userAgent;
  return meta;
}

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ): Promise<TokenPair> {
    return this.auth.login(dto, buildMeta(userAgent, ipAddress));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto,
    @Headers('user-agent') userAgent: string | undefined,
    @Ip() ipAddress: string,
  ): Promise<TokenPair> {
    return this.auth.refresh(dto.refresh_token, buildMeta(userAgent, ipAddress));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentUser() user: AuthContext): Promise<void> {
    await this.auth.logout(user.id);
  }

  @Get('me')
  me(@CurrentUser() user: AuthContext): AuthContext {
    return user;
  }
}
