/**
 * Loads `.env` into `process.env` before any other module evaluates.
 * This file MUST be imported as the very first import in `main.ts`,
 * before `tracing` or `AppModule`. Both of those read `process.env` at
 * module evaluation time and would otherwise see an empty environment.
 *
 * The repo `.env` lives at the monorepo root, but `pnpm --filter @keyloop/api dev`
 * runs with cwd = `packages/api`. We resolve relative to this file so the
 * load works regardless of cwd.
 *   - When compiled (dev / start): __dirname = `packages/api/dist`
 *   - When ts-node (tests / scripts): __dirname = `packages/api/src`
 *   Both `../../../.env` resolutions land at the repo root.
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { EventEmitter } from 'node:events';
import * as dotenv from 'dotenv';

// Raise the EventEmitter listener cap. pg.Pool extends EventEmitter and does
// not expose a config knob; with multiple feature modules (auth, appointments,
// customers, dealerships, vehicles, outbox) each subscribing to pool events,
// we cross the default 10-listener limit and Node prints a noisy warning. 50
// is comfortable headroom; the actual count is ~12–15 in steady state.
EventEmitter.defaultMaxListeners = 50;

const candidates = [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(__dirname, '../../../../.env'),
  path.resolve(process.cwd(), '.env'),
];

for (const candidate of candidates) {
  if (fs.existsSync(candidate)) {
    const result = dotenv.config({ path: candidate });
    if (result.error) {
      console.error(`Failed to parse env file ${candidate}:`, result.error);
    }
    break;
  }
}
