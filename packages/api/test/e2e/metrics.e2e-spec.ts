import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('Metrics endpoint (e2e)', () => {
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

  it('GET /metrics returns Prometheus exposition text', async () => {
    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toContain('process_cpu_seconds_total');
    expect(res.text).toContain('nodejs_heap_size_total_bytes');
  });
});
