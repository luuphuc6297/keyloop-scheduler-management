import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import helmet from 'helmet';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('Security headers (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
          },
        },
        hsts: { maxAge: 31_536_000, includeSubDomains: true, preload: true },
        noSniff: true,
        frameguard: { action: 'deny' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds with X-Frame-Options DENY', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['x-frame-options']).toBe('DENY');
  });

  it('responds with X-Content-Type-Options nosniff', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('responds with Strict-Transport-Security max-age', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=\d+/);
  });

  it('responds with Content-Security-Policy default-src self', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['content-security-policy']).toMatch(/default-src 'self'/);
  });
});
