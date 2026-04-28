import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { HttpException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { IsNull, LessThan, MoreThan, Repository } from 'typeorm';
import type { AppConfig } from '../../../config/config.schema';
import type { LoginDto } from '../dtos/login.schema';
import { AppUser } from '../entities/app-user.entity';
import { FailedLoginAttempt } from '../entities/failed-login-attempt.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import type { JwtPayload, TokenPair } from '../types/auth-context';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_DAYS = 7;
const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_WINDOW_MINUTES = 15;
const LOCKOUT_DURATION_MINUTES = 30;

export interface ClientMeta {
  userAgent?: string;
  ipAddress?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(AppUser) private readonly users: Repository<AppUser>,
    @InjectRepository(RefreshToken) private readonly refreshTokens: Repository<RefreshToken>,
    @InjectRepository(FailedLoginAttempt)
    private readonly failedLogins: Repository<FailedLoginAttempt>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async login(dto: LoginDto, meta: ClientMeta): Promise<TokenPair> {
    const user = await this.users.findOne({ where: { email: dto.email } });

    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new HttpException(
        { code: 'ACCOUNT_LOCKED', message: 'Account locked', lockedUntil: user.lockedUntil.toISOString() },
        423, // HTTP 423 Locked
      );
    }

    const passwordValid = user ? await argon2.verify(user.passwordHash, dto.password) : false;

    if (!user || !passwordValid) {
      await this.recordFailedLogin(dto.email, meta);
      if (user) {
        const recent = await this.countRecentFailedLogins(dto.email, LOCKOUT_WINDOW_MINUTES);
        if (recent >= LOCKOUT_THRESHOLD) {
          const until = new Date(Date.now() + LOCKOUT_DURATION_MINUTES * 60_000);
          await this.users.update(user.id, { lockedUntil: until });
          this.logger.warn(`Account locked: ${dto.email} until ${until.toISOString()}`);
        }
      }
      throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });
    }

    await this.users.update(user.id, { failedLoginCount: 0, lockedUntil: null });
    return this.issueTokenPair(user, meta);
  }

  async refresh(rawToken: string, meta: ClientMeta): Promise<TokenPair> {
    const tokenHash = sha256(rawToken);
    const stored = await this.refreshTokens.findOne({ where: { tokenHash } });

    if (stored?.revokedAt) {
      await this.refreshTokens.update({ familyId: stored.familyId }, { revokedAt: new Date() });
      this.logger.warn(`Refresh token reuse detected for family ${stored.familyId}, user ${stored.userId}`);
      throw new UnauthorizedException({ code: 'TOKEN_REVOKED', message: 'Token revoked' });
    }

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException({ code: 'TOKEN_INVALID', message: 'Token invalid or expired' });
    }

    await this.refreshTokens.update(stored.id, { revokedAt: new Date() });
    const user = await this.users.findOneOrFail({ where: { id: stored.userId } });
    return this.issueTokenPair(user, meta, stored.familyId);
  }

  async logout(userId: string): Promise<void> {
    await this.refreshTokens.update({ userId, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issueTokenPair(user: AppUser, meta: ClientMeta, familyId?: string): Promise<TokenPair> {
    const payload: JwtPayload = {
      sub: user.id,
      dealership_id: user.dealershipId,
      roles: user.roles,
      jti: randomUUID(),
    };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: `${ACCESS_TOKEN_TTL_SECONDS}s`,
    });

    const refreshTokenRaw = randomBytes(32).toString('base64url');
    const refreshTokenHash = sha256(refreshTokenRaw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

    await this.refreshTokens.save({
      userId: user.id,
      tokenHash: refreshTokenHash,
      familyId: familyId ?? randomUUID(),
      expiresAt,
      userAgent: meta.userAgent ?? null,
      ipAddress: meta.ipAddress ?? null,
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    };
  }

  private async recordFailedLogin(email: string, meta: ClientMeta): Promise<void> {
    await this.failedLogins.save({
      email,
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });
  }

  private async countRecentFailedLogins(email: string, windowMinutes: number): Promise<number> {
    const since = new Date(Date.now() - windowMinutes * 60_000);
    return this.failedLogins.count({
      where: { email, attemptedAt: MoreThan(since) },
    });
  }

  async cleanExpiredRefreshTokens(): Promise<number> {
    const result = await this.refreshTokens.delete({ expiresAt: LessThan(new Date()) });
    return result.affected ?? 0;
  }
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
