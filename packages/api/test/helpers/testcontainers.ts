import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { DataSource } from 'typeorm';

export class TestDb {
  container!: StartedPostgreSqlContainer;
  ownerDs!: DataSource;
  appDs!: DataSource;

  async start(): Promise<void> {
    this.container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('scheduler_test')
      .withUsername('owner')
      .withPassword('owner')
      .start();

    this.ownerDs = await this.connect('owner', 'owner');

    await this.ownerDs.query('CREATE EXTENSION IF NOT EXISTS btree_gist');
    await this.ownerDs.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await this.ownerDs.query('CREATE EXTENSION IF NOT EXISTS citext');

    await this.ownerDs.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'scheduler_app') THEN
          CREATE ROLE scheduler_app LOGIN PASSWORD 'app';
        END IF;
      END $$;
    `);
    await this.ownerDs.query('GRANT USAGE ON SCHEMA public TO scheduler_app');

    this.appDs = await this.connect('scheduler_app', 'app');
  }

  async truncateAll(): Promise<void> {
    const tables = (await this.ownerDs.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public'`,
    )) as Array<{ tablename: string }>;
    if (tables.length === 0) return;
    const names = tables.map((t) => `"${t.tablename}"`).join(',');
    await this.ownerDs.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
  }

  async stop(): Promise<void> {
    await this.appDs?.destroy();
    await this.ownerDs?.destroy();
    await this.container?.stop();
  }

  private async connect(username: string, password: string): Promise<DataSource> {
    return new DataSource({
      type: 'postgres',
      host: this.container.getHost(),
      port: this.container.getPort(),
      username,
      password,
      database: this.container.getDatabase(),
      entities: [],
      synchronize: false,
      logging: false,
    }).initialize();
  }
}
