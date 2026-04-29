/**
 * k6 contention test — proves the EXCLUDE constraint serializes concurrent
 * overlapping bookings correctly.
 *
 * Setup:
 *   - 30 VUs all attempt to book the SAME bay/technician at the SAME minute,
 *     each with a unique Idempotency-Key (so the requests pass dedup and reach
 *     the DB).
 *   - Expected outcome: exactly 1 returns 201, the remaining N-1 return
 *     409 BAY_UNAVAILABLE or 409 TECHNICIAN_UNAVAILABLE.
 *   - p99 latency for the losers should remain < 200ms because the constraint
 *     fails fast (no SERIALIZABLE retry storm).
 *
 * Usage:
 *   API_BASE=http://localhost:3001 \
 *   API_EMAIL=lifecycle-test@example.com \
 *   API_PASSWORD='CorrectHorseBatteryStaple!' \
 *   k6 run loadtest/booking-contention.js
 *
 * Reference: design doc §3.4 (Race Condition data flow), §6.4 (edge cases).
 */

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { ulid } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const API_BASE = __ENV.API_BASE || 'http://localhost:3001';
const API_EMAIL = __ENV.API_EMAIL || 'lifecycle-test@example.com';
const API_PASSWORD = __ENV.API_PASSWORD || 'CorrectHorseBatteryStaple!';

// Each iteration of the test is a "wave" — all 30 VUs race at the same time.
// We use a small stagger plus a barrier to maximize true concurrency.
export const options = {
  scenarios: {
    contention: {
      executor: 'per-vu-iterations',
      vus: 30,
      iterations: 1, // each VU sends one booking
      maxDuration: '60s',
    },
  },
  thresholds: {
    // Exactly one VU should win the race
    bookings_won: ['count==1'],
    // Everyone else should hit a recognized 409
    bookings_lost: ['count==29'],
    // Losers fail fast — p99 under 250ms
    'http_req_duration{outcome:lost}': ['p(99)<250'],
    // Winners are also fast — p99 under 500ms (one tx commits, audit + outbox written)
    'http_req_duration{outcome:won}': ['p(99)<500'],
  },
};

const wonCounter = new Counter('bookings_won');
const lostCounter = new Counter('bookings_lost');
const unexpectedCounter = new Counter('bookings_unexpected');
const winLatency = new Trend('booking_won_latency');
const lossLatency = new Trend('booking_lost_latency');

let cachedFixture = null;

export function setup() {
  // 1. Login once
  const loginRes = http.post(
    `${API_BASE}/api/v1/auth/login`,
    JSON.stringify({ email: API_EMAIL, password: API_PASSWORD }),
    { headers: { 'content-type': 'application/json' } },
  );
  check(loginRes, { 'login OK': (r) => r.status === 200 });
  const accessToken = JSON.parse(loginRes.body).accessToken;

  // 2. Fetch catalog
  const headers = { authorization: `Bearer ${accessToken}` };
  const services = JSON.parse(
    http.get(`${API_BASE}/api/v1/dealerships/me/service-types`, { headers }).body,
  ).data;
  const technicians = JSON.parse(
    http.get(`${API_BASE}/api/v1/dealerships/me/technicians`, { headers }).body,
  ).data;
  const bays = JSON.parse(http.get(`${API_BASE}/api/v1/dealerships/me/bays`, { headers }).body).data;
  const customers = JSON.parse(
    http.get(`${API_BASE}/api/v1/customers?q=Lifecycle`, { headers }).body,
  ).data;
  const customer = customers[0];
  const vehicles = JSON.parse(
    http.get(`${API_BASE}/api/v1/vehicles?customer_id=${customer.id}`, { headers }).body,
  ).data;

  if (!services[0] || !technicians[0] || !bays[0] || !customer || !vehicles[0]) {
    throw new Error('Run pnpm seed:dev and the lifecycle e2e test first to seed fixtures');
  }

  // 3. Pick a slot far in the future to avoid colliding with prior runs
  const now = new Date();
  const start = new Date(now.getFullYear() + 1, 0, 15, 14, 0, 0); // Jan 15 next year, 14:00 local

  return {
    accessToken,
    payload: {
      start_at: start.toISOString(),
      customer_id: customer.id,
      vehicle_id: vehicles[0].id,
      service_type_id: services[0].id,
      technician_id: technicians[0].id,
      bay_id: bays[0].id,
    },
  };
}

export default function (data) {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${data.accessToken}`,
    'idempotency-key': ulid(),
  };

  // Stagger barrier — each VU waits until the next 500ms boundary so they all
  // fire roughly simultaneously. Without this, k6 ramps VU starts and the race
  // has weak overlap.
  const wallNow = Date.now();
  const barrier = Math.ceil(wallNow / 500) * 500 + 500;
  sleep((barrier - wallNow) / 1000);

  group('book the same slot', () => {
    const res = http.post(`${API_BASE}/api/v1/appointments`, JSON.stringify(data.payload), {
      headers,
      tags: { endpoint: 'POST /appointments', outcome: 'pending' },
    });

    if (res.status === 201) {
      wonCounter.add(1);
      winLatency.add(res.timings.duration);
      res.tags.outcome = 'won';
      check(res, {
        'winner returns version 1': (r) => JSON.parse(r.body).version === 1,
        'winner returns confirmed': (r) => JSON.parse(r.body).status === 'confirmed',
      });
    } else if (res.status === 409) {
      lostCounter.add(1);
      lossLatency.add(res.timings.duration);
      res.tags.outcome = 'lost';
      const body = (() => {
        try {
          return JSON.parse(res.body);
        } catch {
          return {};
        }
      })();
      check(res, {
        'loser has known conflict code': () =>
          ['BAY_UNAVAILABLE', 'TECHNICIAN_UNAVAILABLE', 'BOOKING_CONFLICT'].includes(body.code),
      });
    } else {
      unexpectedCounter.add(1);
      console.error(`unexpected status ${res.status}: ${res.body}`);
    }
  });
}

export function handleSummary(data) {
  const summary = {
    contention_test: {
      vus: 30,
      bookings_won: data.metrics.bookings_won?.values?.count ?? 0,
      bookings_lost: data.metrics.bookings_lost?.values?.count ?? 0,
      bookings_unexpected: data.metrics.bookings_unexpected?.values?.count ?? 0,
      winner_p99_ms: data.metrics.booking_won_latency?.values?.['p(99)'] ?? null,
      loser_p99_ms: data.metrics.booking_lost_latency?.values?.['p(99)'] ?? null,
      thresholds: data.metrics.bookings_won?.thresholds,
    },
  };
  return {
    stdout: '\n' + JSON.stringify(summary, null, 2) + '\n',
    'loadtest/results-contention.json': JSON.stringify(data, null, 2),
  };
}
