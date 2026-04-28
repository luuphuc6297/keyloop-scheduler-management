import * as dotenv from 'dotenv';
import * as path from 'node:path';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL_MIGRATIONS or DATABASE_URL must be set');
}

export default new DataSource({
  type: 'postgres',
  url,
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
  logging: ['error', 'warn'],
});
