import { Test } from '@nestjs/testing';
import request from 'supertest';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('TypeORM (integration — requires running Postgres)', () => {
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

  it('connects to Postgres successfully', async () => {
    const ds = app.get(DataSource);
    expect(ds.isInitialized).toBe(true);
    const result = (await ds.query('SELECT 1 AS one')) as Array<{ one: number }>;
    expect(result[0]?.one).toBe(1);
  });

  it('GET /health/readiness includes db indicator passing', async () => {
    const res = await request(app.getHttpServer()).get('/health/readiness');
    expect(res.status).toBe(200);
    expect(res.body.info?.postgres?.status).toBe('up');
  });
});
