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

// Minimal unique-id generator (k6-utils doesn't export ulid). Format
// doesn't matter for Idempotency-Key — only uniqueness across the run.
function uniqueId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${__VU}-${__ITER}`;
}

// Defensive JSON.parse — k6 response bodies can be empty / non-JSON when the
// upstream returns an error page or 0-status (network failure).
function safeJson(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

const API_BASE = __ENV.API_BASE || 'http://localhost:3001';
const API_EMAIL = __ENV.API_EMAIL || 'admin@nyc-auto.local';
const API_PASSWORD = __ENV.API_PASSWORD || 'Demo1234!';

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
    // Use our custom Trends instead of the http_req_duration tag filter
    booking_won_latency: ['p(99)<500'],
    booking_lost_latency: ['p(99)<250'],
  },
};

const wonCounter = new Counter('bookings_won');
const lostCounter = new Counter('bookings_lost');
const unexpectedCounter = new Counter('bookings_unexpected');
const winLatency = new Trend('booking_won_latency');
const lossLatency = new Trend('booking_lost_latency');

let cachedFixture = null;

function fetchJson(label, res) {
  if (res.status !== 200) {
    throw new Error(
      `${label}: HTTP ${res.status} — ${(res.body || '').toString().slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(res.body);
  } catch (err) {
    throw new Error(`${label}: invalid JSON — ${(res.body || '').toString().slice(0, 200)}`);
  }
}

export function setup() {
  // 1. Login once
  const loginRes = http.post(
    `${API_BASE}/api/v1/auth/login`,
    JSON.stringify({ email: API_EMAIL, password: API_PASSWORD }),
    { headers: { 'content-type': 'application/json' } },
  );
  if (loginRes.status !== 200) {
    throw new Error(
      `Login failed (${loginRes.status}). Run the dev seed (pnpm --filter @keyloop/api seed:dev) ` +
        `and pass the right creds: API_EMAIL=admin@nyc-auto.local API_PASSWORD='Demo1234!' k6 run ...`,
    );
  }
  const accessToken = JSON.parse(loginRes.body).accessToken;

  // 2. Fetch catalog. Empty `q` returns the dealership's recent customers.
  const headers = { authorization: `Bearer ${accessToken}` };
  const services = fetchJson(
    'service-types',
    http.get(`${API_BASE}/api/v1/dealerships/me/service-types`, { headers }),
  ).data;
  const technicians = fetchJson(
    'technicians',
    http.get(`${API_BASE}/api/v1/dealerships/me/technicians`, { headers }),
  ).data;
  const bays = fetchJson('bays', http.get(`${API_BASE}/api/v1/dealerships/me/bays`, { headers })).data;
  const customers = fetchJson(
    'customers',
    http.get(`${API_BASE}/api/v1/customers?limit=20`, { headers }),
  ).data;
  if (!customers || customers.length === 0) {
    throw new Error('No customers found. Run the dev seed first: pnpm --filter @keyloop/api seed:dev');
  }
  const customer = customers[0];
  const vehicles = fetchJson(
    'vehicles',
    http.get(`${API_BASE}/api/v1/vehicles?customer_id=${customer.id}`, { headers }),
  ).data;

  if (!services[0] || !technicians[0] || !bays[0] || !vehicles[0]) {
    throw new Error('Seed incomplete. Run: pnpm --filter @keyloop/api seed:dev');
  }

  // Pick a service that ALL technicians can perform (no skill mismatch).
  // Oil Change is in the seed; every technician has OIL_CHANGE skill.
  const oilChange = services.find((s) => s.name === 'Oil Change') || services[0];

  // 3. Pick a UNIQUE slot per run.
  //    Construct the ISO with EXPLICIT America/New_York offset (-05:00) so
  //    the API parses 14:00 *NY local* — not 14:00 in whatever timezone the
  //    box running k6 is in. (Without this, a Vietnam-based machine sends
  //    14:00 ICT = 03:00 EST → fails OUTSIDE_BUSINESS_HOURS for all 30 VUs.)
  const now = new Date();
  const future = new Date(now.getFullYear() + 1, 0, 1);
  future.setDate(future.getDate() + Math.floor(Math.random() * 250));
  while (future.getUTCDay() !== 3) future.setDate(future.getDate() + 1); // Wednesday
  const yy = future.getUTCFullYear();
  const mm = String(future.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(future.getUTCDate()).padStart(2, '0');
  // 14:00 EST → 19:00 UTC. EST is dealership winter time; in summer (EDT)
  // this becomes 15:00 NY local — still inside business hours (8-18).
  const startAtIso = `${yy}-${mm}-${dd}T14:00:00-05:00`;

  console.log(`Contention slot: ${startAtIso}`);

  return {
    accessToken,
    payload: {
      start_at: startAtIso,
      customer_id: customer.id,
      vehicle_id: vehicles[0].id,
      service_type_id: oilChange.id,
      technician_id: technicians[0].id,
      bay_id: bays[0].id,
    },
  };
}

export default function (data) {
  const headers = {
    'content-type': 'application/json',
    authorization: `Bearer ${data.accessToken}`,
    'idempotency-key': uniqueId(),
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
      const winnerBody = safeJson(res.body);
      check(res, {
        'winner returns version 1': () => winnerBody.version === 1,
        'winner returns confirmed': () => winnerBody.status === 'confirmed',
      });
    } else if (res.status === 409) {
      lostCounter.add(1);
      lossLatency.add(res.timings.duration);
      const body = safeJson(res.body);
      check(res, {
        'loser has known conflict code': () =>
          ['BAY_UNAVAILABLE', 'TECHNICIAN_UNAVAILABLE', 'BOOKING_CONFLICT'].includes(body.code),
      });
    } else {
      unexpectedCounter.add(1);
      console.error(`unexpected status ${res.status}: ${(res.body || '').toString().slice(0, 300)}`);
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
