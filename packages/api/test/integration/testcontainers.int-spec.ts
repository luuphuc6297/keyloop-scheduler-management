import { TestDb } from '@test/helpers/testcontainers';

jest.setTimeout(60_000);

describe('TestDb helper (integration — requires Docker)', () => {
  let db: TestDb;

  beforeAll(async () => {
    db = new TestDb();
    await db.start();
  });

  afterAll(async () => {
    await db.stop();
  });

  it('starts a Postgres container with required extensions', async () => {
    const result = (await db.ownerDs.query(
      "SELECT extname FROM pg_extension WHERE extname IN ('btree_gist','pgcrypto','citext') ORDER BY extname",
    )) as Array<{ extname: string }>;
    expect(result.map((r) => r.extname)).toEqual(['btree_gist', 'citext', 'pgcrypto']);
  });

  it('creates scheduler_app role with no BYPASSRLS', async () => {
    const result = (await db.ownerDs.query(
      `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'scheduler_app'`,
    )) as Array<{ rolname: string; rolbypassrls: boolean }>;
    expect(result[0]?.rolbypassrls).toBe(false);
  });

  it('truncateAll() does not throw when no tables exist', async () => {
    await expect(db.truncateAll()).resolves.not.toThrow();
  });
});
