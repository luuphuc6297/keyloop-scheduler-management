import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let dealershipId: string;
  const email = 'auth-test@example.com';
  const password = 'CorrectHorseBatteryStaple!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();

    ds = app.get(DataSource);

    // Use owner-level connection (bypasses RLS) for setup
    await ds.query(`DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM failed_login_attempt WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);

    const [d] = (await ds.query(`SELECT id FROM dealership ORDER BY created_at LIMIT 1`)) as Array<{
      id: string;
    }>;
    if (!d) throw new Error('Run seed first: pnpm --filter @keyloop/api seed:dev');
    dealershipId = d.id;

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await ds.query(
      `INSERT INTO app_user (dealership_id, email, password_hash, roles)
       VALUES ($1, $2, $3, ARRAY['service_advisor', 'manager'])`,
      [dealershipId, email, passwordHash],
    );
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM failed_login_attempt WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);
    await app.close();
  });

  it('POST /auth/login returns access + refresh tokens for valid credentials', async () => {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.expiresIn).toBe(900);
  });

  it('POST /auth/login rejects wrong password with 401', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password: 'WrongPassword!!' });

    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('GET /auth/me returns the user when access token valid', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });

    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.dealershipId).toBe(dealershipId);
    expect(res.body.roles).toContain('service_advisor');
  });

  it('GET /auth/me returns 401 without access token', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
  });

  it('POST /auth/refresh issues a new pair and detects reuse', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    const originalRefresh = login.body.refreshToken;

    // First refresh — succeeds
    const r1 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefresh });
    expect(r1.status).toBe(200);
    expect(r1.body.refreshToken).not.toBe(originalRefresh);

    // Reusing the now-revoked refresh token — should detect reuse
    const r2 = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refresh_token: originalRefresh });
    expect(r2.status).toBe(401);
    expect(r2.body.code).toBe('TOKEN_REVOKED');
  });
});
