import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ObservabilityModule } from '../observability/observability.module';
import { AuthController } from './controllers/auth.controller';
import { AppUser } from './entities/app-user.entity';
import { FailedLoginAttempt } from './entities/failed-login-attempt.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { AuthService } from './services/auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import type { AppConfig } from '../../config/config.schema';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppUser, RefreshToken, FailedLoginAttempt]),
    ObservabilityModule,
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
