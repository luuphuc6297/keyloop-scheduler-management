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
}

describe('Booking (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let accessToken: string;
  let fx: Fixture;
  const email = 'booking-test@example.com';
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
    await ds.query(`DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM vehicle WHERE customer_id IN (SELECT id FROM customer WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM customer WHERE email = $1`, [email]);

    // Pick a seeded dealership
    const [d] = (await ds.query(`SELECT id FROM dealership ORDER BY created_at LIMIT 1`)) as Array<{
      id: string;
    }>;
    if (!d) throw new Error('Run seed first: pnpm --filter @keyloop/api seed:dev');
    const dealershipId = d.id;

    // Create test app_user
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    await ds.query(
      `INSERT INTO app_user (dealership_id, email, password_hash, roles)
       VALUES ($1, $2, $3, ARRAY['service_advisor', 'manager'])`,
      [dealershipId, email, passwordHash],
    );

    // Create test customer + vehicle
    const [customer] = (await ds.query(
      `INSERT INTO customer (dealership_id, first_name, last_name, email)
       VALUES ($1, 'Test', 'Booking', $2) RETURNING id`,
      [dealershipId, email],
    )) as Array<{ id: string }>;
    const [vehicle] = (await ds.query(
      `INSERT INTO vehicle (dealership_id, customer_id, vin, make, model, year)
       VALUES ($1, $2, 'BOOKINGTEST00000001', 'Toyota', 'Camry', 2022) RETURNING id`,
      [dealershipId, customer!.id],
    )) as Array<{ id: string }>;

    // Pick a seeded service_type, technician, bay (from dev seed)
    // Pin to Oil Change so any technician qualifies for the skill-match validator
    const [serviceType] = (await ds.query(
      `SELECT id FROM service_type WHERE dealership_id = $1 AND name = 'Oil Change' LIMIT 1`,
      [dealershipId],
    )) as Array<{ id: string }>;
    const [technician] = (await ds.query(`SELECT id FROM technician WHERE dealership_id = $1 LIMIT 1`, [
      dealershipId,
    ])) as Array<{ id: string }>;
    const [bay] = (await ds.query(`SELECT id FROM bay WHERE dealership_id = $1 LIMIT 1`, [
      dealershipId,
    ])) as Array<{ id: string }>;

    fx = {
      customerId: customer!.id,
      vehicleId: vehicle!.id,
      serviceTypeId: serviceType!.id,
      technicianId: technician!.id,
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
    await ds.query(`DELETE FROM refresh_token WHERE user_id IN (SELECT id FROM app_user WHERE email = $1)`, [
      email,
    ]);
    await ds.query(`DELETE FROM app_user WHERE email = $1`, [email]);
    await ds.query(`DELETE FROM vehicle WHERE id = $1`, [fx.vehicleId]);
    await ds.query(`DELETE FROM customer WHERE id = $1`, [fx.customerId]);
    await app.close();
  });

  function payload(startAt: string) {
    return {
      start_at: startAt,
      customer_id: fx.customerId,
      vehicle_id: fx.vehicleId,
      service_type_id: fx.serviceTypeId,
      technician_id: fx.technicianId,
      bay_id: fx.bayId,
    };
  }

  it('POST /appointments returns 201 with idempotency key', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', ulid())
      .send(payload('2026-06-01T14:00:00-04:00'));

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('confirmed');
    expect(res.body.version).toBe(1);
  });

  it('returns 400 when Idempotency-Key header missing', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(payload('2026-06-01T15:00:00-04:00'));

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('idempotent replay: same key + same body returns cached response', async () => {
    const key = ulid();
    const body = payload('2026-06-01T16:00:00-04:00');

    const r1 = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(r1.status).toBe(201);

    const r2 = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', key)
      .send(body);
    expect(r2.status).toBe(201);
    expect(r2.body.id).toBe(r1.body.id);
  });

  it('returns 409 BAY_UNAVAILABLE on overlapping booking same bay', async () => {
    const r1 = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', ulid())
      .send(payload('2026-06-01T13:00:00-04:00'));
    expect(r1.status).toBe(201);

    const r2 = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', ulid())
      .send(payload('2026-06-01T13:15:00-04:00')); // overlaps r1 (30 min duration)

    expect(r2.status).toBe(409);
    expect(['BAY_UNAVAILABLE', 'TECHNICIAN_UNAVAILABLE']).toContain(r2.body.code);
  });

  it('returns 409 INVALID_LOCAL_TIME for DST spring-forward gap', async () => {
    // 2026-03-08 02:30 EST does not exist (clocks jump 02:00 → 03:00 EDT)
    const res = await request(app.getHttpServer())
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Idempotency-Key', ulid())
      .send(payload('2026-03-08T02:30:00-05:00'));

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_LOCAL_TIME');
  });
});
