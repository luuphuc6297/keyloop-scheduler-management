import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('Health (e2e)', () => {
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

  it('GET /health/liveness returns 200 with status ok', async () => {
    const res = await request(app.getHttpServer()).get('/health/liveness');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /health/readiness returns 200 (no DB indicator yet)', async () => {
    const res = await request(app.getHttpServer()).get('/health/readiness');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
