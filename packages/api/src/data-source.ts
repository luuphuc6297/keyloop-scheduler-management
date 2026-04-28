import 'dotenv/config';
import { DataSource } from 'typeorm';

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
