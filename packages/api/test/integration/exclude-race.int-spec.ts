import { TestDb } from '@test/helpers/testcontainers';
import path from 'node:path';
import fs from 'node:fs';

jest.setTimeout(120_000);

/**
 * Race condition integration test — THE money shot of the design.
 *
 * Verifies that 2 partial EXCLUDE constraints (bay_id, technician_id) WHERE status='confirmed'
 * prevent double-booking under concurrent load. Spawns N parallel INSERTs for the same
 * bay+technician+time-range; asserts exactly 1 succeeds and N-1 fail with 23P01.
 *
 * Reference: design doc Section 6 + Section 11.5.
 */

interface Fixtures {
  dealershipId: string;
  customerId: string;
  vehicleId: string;
  technicianId: string;
  bayId: string;
  serviceTypeId: string;
  appUserId: string;
}

async function applyMigrations(db: TestDb): Promise<void> {
  // Apply migrations as raw SQL (avoids needing TypeORM CLI in tests).
  // Read migration files and execute their up() bodies via fresh QueryRunner.
  const migrationDir = path.join(__dirname, '..', '..', 'src', 'migrations');
  const files = fs
    .readdirSync(migrationDir)
    .filter((f) => f.endsWith('.ts'))
    .sort();

  for (const file of files) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(path.join(migrationDir, file)) as Record<
      string,
      new () => { up: (qr: unknown) => Promise<void> }
    >;
    const Cls = Object.values(mod).find((v) => typeof v === 'function');
    if (!Cls) continue;
    const instance = new Cls();
    const qr = db.ownerDs.createQueryRunner();
    await qr.connect();
    try {
      await instance.up(qr);
    } finally {
      await qr.release();
    }
  }
}

async function seedFixtures(db: TestDb): Promise<Fixtures> {
  const [dealership] = (await db.ownerDs.query(
    `INSERT INTO dealership (name, timezone) VALUES ('Test Dealership', 'America/New_York') RETURNING id`,
  )) as Array<{ id: string }>;
  if (!dealership) throw new Error('dealership seed failed');

  const [user] = (await db.ownerDs.query(
    `INSERT INTO app_user (dealership_id, email, password_hash, roles)
     VALUES ($1, 'test@example.com', 'placeholder', ARRAY['service_advisor'])
     RETURNING id`,
    [dealership.id],
  )) as Array<{ id: string }>;
  if (!user) throw new Error('user seed failed');

  const [customer] = (await db.ownerDs.query(
    `INSERT INTO customer (dealership_id, first_name, last_name) VALUES ($1, 'Test', 'Customer') RETURNING id`,
    [dealership.id],
  )) as Array<{ id: string }>;
  if (!customer) throw new Error('customer seed failed');

  const [vehicle] = (await db.ownerDs.query(
    `INSERT INTO vehicle (dealership_id, customer_id, vin, make, model, year)
     VALUES ($1, $2, 'TESTVIN0000000001', 'Toyota', 'Camry', 2022) RETURNING id`,
    [dealership.id, customer.id],
  )) as Array<{ id: string }>;
  if (!vehicle) throw new Error('vehicle seed failed');

  const [skill] = (await db.ownerDs.query(
    `INSERT INTO skill (code, name) VALUES ('OIL_CHANGE', 'Oil Change') RETURNING id`,
  )) as Array<{ id: string }>;
  if (!skill) throw new Error('skill seed failed');

  const [serviceType] = (await db.ownerDs.query(
    `INSERT INTO service_type (dealership_id, name, duration_minutes, buffer_minutes, required_skill_id)
     VALUES ($1, 'Oil Change', 30, 0, $2) RETURNING id`,
    [dealership.id, skill.id],
  )) as Array<{ id: string }>;
  if (!serviceType) throw new Error('service_type seed failed');

  const [bay] = (await db.ownerDs.query(
    `INSERT INTO bay (dealership_id, name) VALUES ($1, 'Bay 1') RETURNING id`,
    [dealership.id],
  )) as Array<{ id: string }>;
  if (!bay) throw new Error('bay seed failed');

  const [technician] = (await db.ownerDs.query(
    `INSERT INTO technician (dealership_id, first_name, last_name, employee_code)
     VALUES ($1, 'Charlie', 'Le', 'T001') RETURNING id`,
    [dealership.id],
  )) as Array<{ id: string }>;
  if (!technician) throw new Error('technician seed failed');

  return {
    dealershipId: dealership.id,
    customerId: customer.id,
    vehicleId: vehicle.id,
    technicianId: technician.id,
    bayId: bay.id,
    serviceTypeId: serviceType.id,
    appUserId: user.id,
  };
}

async function insertAppointment(
  db: TestDb,
  fx: Fixtures,
  range: string,
): Promise<{ ok: true; id: string } | { ok: false; code: string; constraint: string }> {
  try {
    const [row] = (await db.ownerDs.query(
      `INSERT INTO appointment
        (dealership_id, customer_id, vehicle_id, service_type_id, technician_id, bay_id, time_range, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7::tstzrange, 'confirmed', $8)
       RETURNING id`,
      [
        fx.dealershipId,
        fx.customerId,
        fx.vehicleId,
        fx.serviceTypeId,
        fx.technicianId,
        fx.bayId,
        range,
        fx.appUserId,
      ],
    )) as Array<{ id: string }>;
    if (!row) throw new Error('No row returned');
    return { ok: true, id: row.id };
  } catch (e) {
    const err = e as { code?: string; constraint?: string };
    return { ok: false, code: err.code ?? 'UNKNOWN', constraint: err.constraint ?? 'UNKNOWN' };
  }
}

describe('EXCLUDE constraint race condition (integration)', () => {
  let db: TestDb;
  let fx: Fixtures;
  const SLOT = '[2026-05-01T13:00:00Z,2026-05-01T13:30:00Z)';

  beforeAll(async () => {
    db = new TestDb();
    await db.start();
    await applyMigrations(db);
    fx = await seedFixtures(db);
  });

  afterAll(async () => {
    await db.stop();
  });

  beforeEach(async () => {
    await db.ownerDs.query(`TRUNCATE TABLE appointment, appointment_history RESTART IDENTITY CASCADE`);
  });

  it('exactly 1 of 10 concurrent identical bookings succeeds', async () => {
    const N = 10;
    const results = await Promise.all(Array.from({ length: N }, () => insertAppointment(db, fx, SLOT)));

    const fulfilled = results.filter((r): r is { ok: true; id: string } => r.ok);
    const rejected = results.filter((r): r is { ok: false; code: string; constraint: string } => !r.ok);

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(N - 1);

    rejected.forEach((r) => {
      expect(r.code).toBe('23P01');
      expect(['appt_bay_no_overlap', 'appt_technician_no_overlap']).toContain(r.constraint);
    });

    const count = (await db.ownerDs.query(`SELECT COUNT(*)::int AS c FROM appointment`)) as Array<{
      c: number;
    }>;
    expect(count[0]?.c).toBe(1);
  });

  it('cancelled appointment frees its slot (partial EXCLUDE)', async () => {
    const first = await insertAppointment(db, fx, SLOT);
    expect(first.ok).toBe(true);

    if (!first.ok) throw new Error('first booking failed unexpectedly');
    await db.ownerDs.query(`UPDATE appointment SET status = 'cancelled' WHERE id = $1`, [first.id]);

    const second = await insertAppointment(db, fx, SLOT);
    expect(second.ok).toBe(true);
  });

  it('non-overlapping ranges both succeed', async () => {
    const r1 = await insertAppointment(db, fx, '[2026-05-01T13:00:00Z,2026-05-01T13:30:00Z)');
    const r2 = await insertAppointment(db, fx, '[2026-05-01T13:30:00Z,2026-05-01T14:00:00Z)');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('half-open boundary: [13:00, 13:30) does NOT conflict with [13:30, 14:00)', async () => {
    // This is the explicit half-open semantics test.
    const r1 = await insertAppointment(db, fx, '[2026-05-01T13:00:00Z,2026-05-01T13:30:00Z)');
    const r2 = await insertAppointment(db, fx, '[2026-05-01T13:30:00Z,2026-05-01T14:00:00Z)');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
  });

  it('overlapping ranges: second booking fails with 23P01', async () => {
    const r1 = await insertAppointment(db, fx, '[2026-05-01T13:00:00Z,2026-05-01T14:00:00Z)');
    const r2 = await insertAppointment(db, fx, '[2026-05-01T13:30:00Z,2026-05-01T14:30:00Z)');
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.code).toBe('23P01');
    }
  });
});
