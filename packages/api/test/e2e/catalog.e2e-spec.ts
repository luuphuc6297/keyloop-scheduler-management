import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import request from 'supertest';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

describe('Catalog & GDPR (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;
  let customerId: string;
  let vehicleId: string;
  const email = 'catalog-test@example.com';
  const password = 'CorrectHorseBatteryStaple!';

  async function login(): Promise<string> {
    const res = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
    return res.body.accessToken;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    ds = app.get(DataSource);

    await ds.query(
      `DELETE FROM appointment_history WHERE appointment_id IN (
         SELECT id FROM appointment WHERE customer_id IN (SELECT id FROM customer WHERE email = $1)
       )`,
      [email],
    );
    await ds.query(
      `DELETE FROM outbox_event WHERE aggregate_id IN (
         SELECT id FROM customer WHERE email = $1
       )`,
      [email],
    );
    await ds.query(
      `DELETE FROM appointment WHERE customer_id IN (SELECT id FROM customer WHERE email = $1)`,
      [email],
    );
    await ds.query(
      `DELETE FROM idempotency_record WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    );
    await ds.query(`DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM vehicle WHERE customer_id IN (SELECT id FROM customer WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM customer WHERE email = $1`, [email]);

    const [d] = (await ds.query(`SELECT id FROM dealership ORDER BY created_at LIMIT 1`)) as Array<{
      id: string;
    }>;
    if (!d) throw new Error('Run seed first: pnpm --filter @keyloop/api seed:dev');
    const dealershipId = d.id;

    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await ds.query(
      `INSERT INTO app_user (dealership_id, email, password_hash, roles)
       VALUES ($1, $2, $3, ARRAY['service_advisor', 'manager'])`,
      [dealershipId, email, passwordHash],
    );

    const [customer] = (await ds.query(
      `INSERT INTO customer (dealership_id, first_name, last_name, email, phone)
       VALUES ($1, 'Catalog', 'Tester', $2, '+15555550100') RETURNING id`,
      [dealershipId, email],
    )) as Array<{ id: string }>;
    customerId = customer!.id;

    const [vehicle] = (await ds.query(
      `INSERT INTO vehicle (dealership_id, customer_id, vin, make, model, year)
       VALUES ($1, $2, 'CATALOGTEST00000001', 'Ford', 'Focus', 2024) RETURNING id`,
      [dealershipId, customerId],
    )) as Array<{ id: string }>;
    vehicleId = vehicle!.id;

    accessToken = await login();
  });

  afterAll(async () => {
    await ds.query(`DELETE FROM outbox_event WHERE aggregate_id = $1`, [customerId]);
    await ds.query(
      `DELETE FROM idempotency_record WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    );
    await ds.query(`DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM vehicle WHERE id = $1`, [vehicleId]);
    await ds.query(`DELETE FROM customer WHERE id = $1`, [customerId]);
    await app.close();
  });

  describe('GET /dealerships/me', () => {
    it('returns the caller dealership', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dealerships/me')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBeDefined();
      expect(res.body.timezone).toBeDefined();
    });

    it('returns service-types list', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dealerships/me/service-types')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('duration_minutes');
    });

    it('returns technicians with their skill codes', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dealerships/me/technicians')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(Array.isArray(res.body.data[0].skills)).toBe(true);
    });

    it('returns bays', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dealerships/me/bays')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('returns business hours + exceptions', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/dealerships/me/business-hours')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.hours)).toBe(true);
      expect(Array.isArray(res.body.exceptions)).toBe(true);
    });
  });

  describe('GET /customers', () => {
    it('searches by name fragment', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .query({ q: 'Catalog' })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.find((c: { id: string }) => c.id === customerId)).toBeDefined();
    });

    it('returns empty list when no match', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .query({ q: 'zzzzz-no-match-zzz' })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });

    it('GET /customers/:id returns detail', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(customerId);
      expect(res.body.email).toBe(email);
    });

    it('GET /customers/:id/data-export returns customer + vehicles + appointments', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/customers/${customerId}/data-export`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.customer.id).toBe(customerId);
      expect(Array.isArray(res.body.vehicles)).toBe(true);
      expect(res.body.vehicles.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.appointments)).toBe(true);
    });

    it('DELETE /customers/:id anonymizes (REDACTED + email NULL)', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'GDPR Article 17 — test request' });
      expect(res.status).toBe(200);
      expect(res.body.first_name).toBe('REDACTED');
      expect(res.body.last_name).toBe('REDACTED');
      expect(res.body.email).toBeNull();
      expect(res.body.anonymized_at).not.toBeNull();
    });

    it('search hides anonymized customers', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/customers')
        .query({ q: 'Catalog' })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.find((c: { id: string }) => c.id === customerId)).toBeUndefined();
    });

    it('rejects double-anonymize', async () => {
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/customers/${customerId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ reason: 'second attempt' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('ALREADY_ANONYMIZED');
    });
  });

  describe('GET /vehicles', () => {
    it('searches by VIN fragment', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .query({ vin: 'CATALOGTEST' })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.find((v: { id: string }) => v.id === vehicleId)).toBeDefined();
    });

    it('searches by customer_id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .query({ customer_id: customerId })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    it('returns recent vehicles when no filter is given', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/vehicles')
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });
  });
});
