/**
 * k6 soak test — sustained read+write load to validate SLOs from spec §10.6.
 *
 * SLO targets:
 *   - p99 read latency  < 200ms
 *   - p99 write latency < 500ms
 *   - error rate (5xx) < 0.1%
 *   - 95% of requests have a request_id propagated to logs (visual check)
 *
 * Mix:
 *   - 70% GET /appointments + GET /availability (reads)
 *   - 20% POST /appointments (writes, distinct slots so EXCLUDE rarely fires)
 *   - 10% PATCH /appointments/:id (reschedule the just-created appointment)
 *
 * Usage:
 *   API_BASE=http://localhost:3001 \
 *   API_EMAIL=lifecycle-test@example.com \
 *   API_PASSWORD='CorrectHorseBatteryStaple!' \
 *   k6 run loadtest/booking-soak.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';
import { ulid } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const API_BASE = __ENV.API_BASE || 'http://localhost:3001';
const API_EMAIL = __ENV.API_EMAIL || 'lifecycle-test@example.com';
const API_PASSWORD = __ENV.API_PASSWORD || 'CorrectHorseBatteryStaple!';

const errorRate = new Rate('error_rate');
const readLatency = new Trend('read_latency_ms');
const writeLatency = new Trend('write_latency_ms');

export const options = {
  scenarios: {
    soak: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 10 }, // ramp up
        { duration: '2m', target: 10 }, // sustained
        { duration: '15s', target: 0 }, // ramp down
      ],
    },
  },
  thresholds: {
    error_rate: ['rate<0.001'], // < 0.1%
    'read_latency_ms': ['p(99)<200'],
    'write_latency_ms': ['p(99)<500'],
  },
};

export function setup() {
  const loginRes = http.post(
    `${API_BASE}/api/v1/auth/login`,
    JSON.stringify({ email: API_EMAIL, password: API_PASSWORD }),
    { headers: { 'content-type': 'application/json' } },
  );
  check(loginRes, { 'login OK': (r) => r.status === 200 });
  const accessToken = JSON.parse(loginRes.body).accessToken;

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

  return {
    accessToken,
    fixture: {
      service_type_id: services[0].id,
      technician_ids: technicians.map((t) => t.id),
      bay_id: bays[0].id,
      customer_id: customer.id,
      vehicle_id: vehicles[0].id,
    },
  };
}

function pickRead(headers, fx) {
  const choice = Math.floor(Math.random() * 2);
  let res;
  if (choice === 0) {
    // List appointments, today + 14 days
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString();
    res = http.get(`${API_BASE}/api/v1/appointments?from=${from}&to=${to}&limit=50`, {
      headers,
      tags: { endpoint: 'GET /appointments' },
    });
  } else {
    // Availability
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
    res = http.get(
      `${API_BASE}/api/v1/appointments/availability?service_type_id=${fx.service_type_id}&from=${from}&to=${to}`,
      { headers, tags: { endpoint: 'GET /availability' } },
    );
  }
  readLatency.add(res.timings.duration);
  errorRate.add(res.status >= 500);
  check(res, { 'read 2xx': (r) => r.status >= 200 && r.status < 300 });
}

function pickWrite(headers, fx) {
  // Distinct slot per VU iteration so EXCLUDE rarely fires
  const minutesFromNow = 60 + Math.floor(Math.random() * 60 * 24 * 30); // 1h–30d future
  const startAt = new Date(Date.now() + minutesFromNow * 60 * 1000);
  startAt.setSeconds(0, 0);
  // Spread across technicians to reduce contention noise
  const techId = fx.technician_ids[Math.floor(Math.random() * fx.technician_ids.length)];

  const res = http.post(
    `${API_BASE}/api/v1/appointments`,
    JSON.stringify({
      start_at: startAt.toISOString(),
      customer_id: fx.customer_id,
      vehicle_id: fx.vehicle_id,
      service_type_id: fx.service_type_id,
      technician_id: techId,
      bay_id: fx.bay_id,
    }),
    {
      headers: { ...headers, 'content-type': 'application/json', 'idempotency-key': ulid() },
      tags: { endpoint: 'POST /appointments' },
    },
  );
  writeLatency.add(res.timings.duration);
  errorRate.add(res.status >= 500);
  // 201 = booked, 409 = collided with another soak iteration — both are fine
  check(res, { 'write 201 or 409': (r) => r.status === 201 || r.status === 409 });
  return res.status === 201 ? JSON.parse(res.body) : null;
}

function pickPatch(headers, appt) {
  if (!appt) return;
  const newStart = new Date(Date.now() + 24 * 3600 * 1000 + Math.floor(Math.random() * 1e7));
  newStart.setSeconds(0, 0);
  const res = http.patch(
    `${API_BASE}/api/v1/appointments/${appt.id}`,
    JSON.stringify({ start_at: newStart.toISOString() }),
    {
      headers: {
        ...headers,
        'content-type': 'application/json',
        'if-match': `"${appt.version}"`,
      },
      tags: { endpoint: 'PATCH /appointments/:id' },
    },
  );
  writeLatency.add(res.timings.duration);
  errorRate.add(res.status >= 500);
}

export default function (data) {
  const headers = { authorization: `Bearer ${data.accessToken}` };
  const roll = Math.random();
  if (roll < 0.7) {
    pickRead(headers, data.fixture);
  } else if (roll < 0.9) {
    pickWrite(headers, data.fixture);
  } else {
    const created = pickWrite(headers, data.fixture);
    pickPatch(headers, created);
  }
  sleep(0.1 + Math.random() * 0.4);
}
