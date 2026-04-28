import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('Request ID (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates X-Request-Id (ULID format) when not provided', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.headers['x-request-id']).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });

  it('honors incoming X-Request-Id when valid ULID', async () => {
    const incoming = '01HQXY1234567890ABCDEFGHJK';
    const res = await request(app.getHttpServer())
      .get('/health/liveness')
      .set('X-Request-Id', incoming);
    expect(res.headers['x-request-id']).toBe(incoming);
  });

  it('replaces invalid X-Request-Id with a fresh ULID', async () => {
    const res = await request(app.getHttpServer())
      .get('/health/liveness')
      .set('X-Request-Id', 'not-a-ulid');
    expect(res.headers['x-request-id']).not.toBe('not-a-ulid');
    expect(res.headers['x-request-id']).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
