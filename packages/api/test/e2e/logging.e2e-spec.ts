import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { AppModule } from '@app/app.module';
import type { INestApplication } from '@nestjs/common';

describe('Logger (e2e)', () => {
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

  it('exposes a Logger instance', () => {
    const logger = app.get(Logger);
    expect(logger).toBeDefined();
    expect(typeof logger.log).toBe('function');
  });
});
