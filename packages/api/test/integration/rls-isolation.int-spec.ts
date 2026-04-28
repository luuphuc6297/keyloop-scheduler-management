import { TestDb } from '@test/helpers/testcontainers';
import path from 'node:path';
import fs from 'node:fs';

jest.setTimeout(120_000);

/**
 * RLS tenant isolation test — verifies that Postgres Row Level Security
 * prevents cross-tenant reads/writes when running as scheduler_app role
 * (no BYPASSRLS) with the per-request `app.current_dealership` GUC set.
 *
 * Reference: design doc Section 7.5–7.6.
 */

async function applyMigrations(db: TestDb): Promise<void> {
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

describe('RLS tenant isolation (integration)', () => {
  let db: TestDb;
  let dealershipA: string;
  let dealershipB: string;

  beforeAll(async () => {
    db = new TestDb();
    await db.start();
    await applyMigrations(db);

    // Seed 2 dealerships and a customer in each (using owner = BYPASSRLS)
    const seedResult = (await db.ownerDs.query(`
      WITH d AS (
        INSERT INTO dealership (name, timezone) VALUES
          ('Dealership A', 'America/New_York'),
          ('Dealership B', 'America/Los_Angeles')
        RETURNING id, name
      )
      SELECT id, name FROM d ORDER BY name
    `)) as Array<{ id: string; name: string }>;
    if (!seedResult[0] || !seedResult[1]) throw new Error('dealership seed failed');
    dealershipA = seedResult[0].id;
    dealershipB = seedResult[1].id;

    await db.ownerDs.query(
      `INSERT INTO customer (dealership_id, first_name, last_name) VALUES
        ($1, 'Alice', 'A'),
        ($2, 'Bob', 'B')`,
      [dealershipA, dealershipB],
    );
  });

  afterAll(async () => {
    await db.stop();
  });

  async function runAsDealership<T>(
    dealershipId: string,
    fn: (qr: { query: (sql: string, params?: unknown[]) => Promise<unknown> }) => Promise<T>,
  ): Promise<T> {
    const qr = db.appDs.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      await qr.query(`SELECT set_config('app.current_dealership', $1, true)`, [dealershipId]);
      const result = await fn(qr);
      await qr.commitTransaction();
      return result;
    } catch (e) {
      await qr.rollbackTransaction();
      throw e;
    } finally {
      await qr.release();
    }
  }

  it('user of dealership A only sees A customers', async () => {
    const rows = (await runAsDealership(dealershipA, (qr) =>
      qr.query(`SELECT first_name FROM customer ORDER BY first_name`),
    )) as Array<{ first_name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.first_name).toBe('Alice');
  });

  it('user of dealership B only sees B customers', async () => {
    const rows = (await runAsDealership(dealershipB, (qr) =>
      qr.query(`SELECT first_name FROM customer ORDER BY first_name`),
    )) as Array<{ first_name: string }>;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.first_name).toBe('Bob');
  });

  it('insert with mismatched dealership_id is rejected by WITH CHECK', async () => {
    await expect(
      runAsDealership(dealershipA, (qr) =>
        qr.query(
          `INSERT INTO customer (dealership_id, first_name, last_name) VALUES ($1, 'Cross', 'Tenant')`,
          [dealershipB],
        ),
      ),
    ).rejects.toThrow();
  });

  it('without setting current_dealership, queries return empty (fail-safe NULL)', async () => {
    const qr = db.appDs.createQueryRunner();
    await qr.connect();
    try {
      const rows = (await qr.query(`SELECT first_name FROM customer`)) as Array<{ first_name: string }>;
      expect(rows).toHaveLength(0);
    } finally {
      await qr.release();
    }
  });
});
