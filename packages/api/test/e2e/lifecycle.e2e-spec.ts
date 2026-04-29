import { Test } from '@nestjs/testing';
import { Logger } from 'nestjs-pino';
import { DataSource } from 'typeorm';
import * as argon2 from 'argon2';
import request from 'supertest';
import { ulid } from 'ulid';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '@app/app.module';

interface Fixture {
  customerId: string;
  vehicleId: string;
  serviceTypeId: string;
  technicianId: string;
  bayId: string;
  altTechnicianId: string;
}

describe('Booking lifecycle (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;
  let fx: Fixture;
  const email = 'lifecycle-test@example.com';
  const password = 'CorrectHorseBatteryStaple!';

  async function login(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email, password });
    return res.body.accessToken;
  }

  async function book(startAt: string, overrides: Partial<Record<string, string>> = {}) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', ulid())
      .send({
        start_at: startAt,
        customer_id: fx.customerId,
        vehicle_id: fx.vehicleId,
        service_type_id: fx.serviceTypeId,
        technician_id: fx.technicianId,
        bay_id: fx.bayId,
        ...overrides,
      });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    app.useLogger(app.get(Logger));
    await app.init();
    ds = app.get(DataSource);

    // Cleanup any prior state for this test user
    await ds.query(
      `DELETE FROM appointment_history WHERE appointment_id IN (
         SELECT id FROM appointment WHERE customer_id IN (
           SELECT id FROM customer WHERE email = $1
         )
       )`,
      [email],
    );
    await ds.query(
      `DELETE FROM outbox_event WHERE aggregate_id IN (
         SELECT id FROM appointment WHERE customer_id IN (
           SELECT id FROM customer WHERE email = $1
         )
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
    await ds.query(
      `DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    );
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
      `INSERT INTO customer (dealership_id, first_name, last_name, email)
       VALUES ($1, 'Test', 'Lifecycle', $2) RETURNING id`,
      [dealershipId, email],
    )) as Array<{ id: string }>;
    const [vehicle] = (await ds.query(
      `INSERT INTO vehicle (dealership_id, customer_id, vin, make, model, year)
       VALUES ($1, $2, 'LIFECYCLETEST0000001', 'Toyota', 'Corolla', 2023) RETURNING id`,
      [dealershipId, customer!.id],
    )) as Array<{ id: string }>;

    // Pin to Oil Change so both techs qualify for the skill-match validator
    const [serviceType] = (await ds.query(
      `SELECT id FROM service_type WHERE dealership_id = $1 AND name = 'Oil Change' LIMIT 1`,
      [dealershipId],
    )) as Array<{ id: string }>;
    const technicians = (await ds.query(
      `SELECT id FROM technician WHERE dealership_id = $1 ORDER BY id ASC LIMIT 2`,
      [dealershipId],
    )) as Array<{ id: string }>;
    const [bay] = (await ds.query(`SELECT id FROM bay WHERE dealership_id = $1 LIMIT 1`, [
      dealershipId,
    ])) as Array<{ id: string }>;

    if (!technicians[0] || !technicians[1]) {
      throw new Error('Seed must produce at least two technicians for lifecycle tests');
    }

    fx = {
      customerId: customer!.id,
      vehicleId: vehicle!.id,
      serviceTypeId: serviceType!.id,
      technicianId: technicians[0].id,
      altTechnicianId: technicians[1].id,
      bayId: bay!.id,
    };

    accessToken = await login();
  });

  afterAll(async () => {
    await ds.query(
      `DELETE FROM appointment_history WHERE appointment_id IN (
         SELECT id FROM appointment WHERE customer_id = $1
       )`,
      [fx.customerId],
    );
    await ds.query(
      `DELETE FROM outbox_event WHERE aggregate_id IN (
         SELECT id FROM appointment WHERE customer_id = $1
       )`,
      [fx.customerId],
    );
    await ds.query(`DELETE FROM appointment WHERE customer_id = $1`, [fx.customerId]);
    await ds.query(
      `DELETE FROM idempotency_record WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    );
    await ds.query(
      `DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`,
      [email],
    );
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM vehicle WHERE id = $1`, [fx.vehicleId]);
    await ds.query(`DELETE FROM customer WHERE id = $1`, [fx.customerId]);
    await app.close();
  });

  describe('GET /appointments/:id', () => {
    it('returns the appointment with ETag matching version', async () => {
      const created = await book('2026-07-01T09:00:00-04:00');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(created.id);
      expect(res.headers.etag).toBe(`"${created.version}"`);
    });

    it('returns 304 on If-None-Match hit', async () => {
      const created = await book('2026-07-01T10:00:00-04:00');
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-None-Match', `"${created.version}"`);
      expect(res.status).toBe(304);
    });

    it('returns 404 for unknown id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/00000000-0000-0000-0000-000000000000`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('APPOINTMENT_NOT_FOUND');
    });
  });

  describe('GET /appointments (list)', () => {
    it('paginates with cursor', async () => {
      // Seed 3 appointments at distinct times
      await book('2026-07-02T08:00:00-04:00');
      await book('2026-07-02T09:00:00-04:00');
      await book('2026-07-02T10:00:00-04:00');

      const r1 = await request(app.getHttpServer())
        .get('/api/v1/appointments')
        .query({ from: '2026-07-02T00:00:00-04:00', to: '2026-07-03T00:00:00-04:00', limit: 2 })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(r1.status).toBe(200);
      expect(r1.body.data.length).toBe(2);
      expect(r1.body.has_more).toBe(true);
      expect(r1.body.next_cursor).not.toBeNull();

      const r2 = await request(app.getHttpServer())
        .get('/api/v1/appointments')
        .query({
          from: '2026-07-02T00:00:00-04:00',
          to: '2026-07-03T00:00:00-04:00',
          limit: 2,
          cursor: r1.body.next_cursor,
        })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(r2.status).toBe(200);
      expect(r2.body.data.length).toBeGreaterThanOrEqual(1);
      expect(r2.body.has_more).toBe(false);
    });

    it('filters by customer_id', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/appointments')
        .query({ customer_id: fx.customerId, limit: 100 })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      for (const row of res.body.data) {
        expect(row.customer_id).toBe(fx.customerId);
      }
    });
  });

  describe('PATCH /appointments/:id (reschedule)', () => {
    it('reschedules with valid If-Match and bumps version', async () => {
      const created = await book('2026-07-03T09:00:00-04:00');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${created.version}"`)
        .send({ start_at: '2026-07-03T11:00:00-04:00' });
      expect(res.status).toBe(200);
      expect(res.body.version).toBe(created.version + 1);
      expect(res.headers.etag).toBe(`"${res.body.version}"`);
    });

    it('returns 412 PRECONDITION_FAILED on stale If-Match', async () => {
      const created = await book('2026-07-03T13:00:00-04:00');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"999"`)
        .send({ start_at: '2026-07-03T14:00:00-04:00' });
      expect(res.status).toBe(412);
      expect(res.body.code).toBe('PRECONDITION_FAILED');
    });

    it('returns 400 IF_MATCH_REQUIRED when missing', async () => {
      const created = await book('2026-07-03T15:00:00-04:00');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ start_at: '2026-07-03T16:00:00-04:00' });
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('IF_MATCH_REQUIRED');
    });

    it('rejects payload with no fields', async () => {
      const created = await book('2026-07-03T17:00:00-04:00');
      const res = await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${created.version}"`)
        .send({});
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /appointments/:id (cancel)', () => {
    it('cancels and bumps version', async () => {
      const created = await book('2026-07-08T09:00:00-04:00');
      const res = await request(app.getHttpServer())
        .delete(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${created.version}"`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
      expect(res.body.version).toBe(created.version + 1);
    });

    it('rejects double-cancel via FSM', async () => {
      const created = await book('2026-07-08T10:00:00-04:00');
      const cancelled = await request(app.getHttpServer())
        .delete(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${created.version}"`);
      expect(cancelled.status).toBe(200);

      const second = await request(app.getHttpServer())
        .delete(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${cancelled.body.version}"`);
      expect(second.status).toBe(409);
      expect(second.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    it('frees the slot for re-booking after cancel', async () => {
      const start = '2026-07-08T11:00:00-04:00';
      const created = await book(start);
      await request(app.getHttpServer())
        .delete(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${created.version}"`)
        .expect(200);

      // Same time, same bay/technician should now book successfully
      const res = await request(app.getHttpServer())
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .set('Idempotency-Key', ulid())
        .send({
          start_at: start,
          customer_id: fx.customerId,
          vehicle_id: fx.vehicleId,
          service_type_id: fx.serviceTypeId,
          technician_id: fx.technicianId,
          bay_id: fx.bayId,
        });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /appointments/:id/history', () => {
    it('returns audit trail in chronological order', async () => {
      const created = await book('2026-07-09T09:00:00-04:00');
      await request(app.getHttpServer())
        .patch(`/api/v1/appointments/${created.id}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .set('If-Match', `"${created.version}"`)
        .send({ start_at: '2026-07-09T10:00:00-04:00' })
        .expect(200);
      const res = await request(app.getHttpServer())
        .get(`/api/v1/appointments/${created.id}/history`)
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0].field).toBe('created');
      expect(res.body.data[1].field).toBe('rescheduled');
    });
  });

  describe('GET /appointments/availability', () => {
    it('returns slots, excluding times overlapped by confirmed bookings', async () => {
      const start = '2026-07-13T09:00:00-04:00';
      const created = await book(start, { technician_id: fx.altTechnicianId });

      const res = await request(app.getHttpServer())
        .get('/api/v1/appointments/availability')
        .query({
          service_type_id: fx.serviceTypeId,
          technician_id: fx.altTechnicianId,
          from: '2026-07-06T08:00:00-04:00',
          to: '2026-07-06T12:00:00-04:00',
        })
        .set('Authorization', `Bearer ${accessToken}`);
      expect(res.status).toBe(200);
      const overlap = res.body.data.find((s: { start_at: string }) => {
        // The booked start is 09:00 EDT == 13:00Z; any returned slot starting in
        // [13:00Z, 13:30Z) would conflict
        return s.start_at >= '2026-07-06T13:00:00.000Z' && s.start_at < '2026-07-06T13:30:00.000Z';
      });
      expect(overlap).toBeUndefined();

      // Cleanup the created appointment
      await ds.query(`DELETE FROM appointment_history WHERE appointment_id = $1`, [created.id]);
      await ds.query(`DELETE FROM outbox_event WHERE aggregate_id = $1`, [created.id]);
      await ds.query(`DELETE FROM appointment WHERE id = $1`, [created.id]);
    });
  });
});
