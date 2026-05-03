import * as dotenv from 'dotenv';
import * as path from 'node:path';
import * as argon2 from 'argon2';
import { DataSource } from 'typeorm';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

/**
 * Dev seed — populate minimal fixtures for local development and demos.
 * Uses owner connection (BYPASSRLS) to insert across tenants.
 *
 * Creates: 2 dealerships (NYC + LA), each with 1 app_user, 2 customers,
 * 2 vehicles per customer, 3 service types, 2 bays, 2 technicians,
 * full week business hours, technician shifts.
 */
async function seed(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATIONS ?? process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL_MIGRATIONS or DATABASE_URL must be set');
  const ds = new DataSource({
    type: 'postgres',
    url,
    synchronize: false,
    logging: ['error', 'warn'],
  });
  await ds.initialize();

  console.log('Truncating existing data...');
  await ds.query(`
    TRUNCATE TABLE appointment_history, appointment, refresh_token,
                   business_hours_exception, business_hours,
                   technician_skill, technician_time_off, technician_shift,
                   technician, bay, service_type, skill,
                   vehicle, customer, app_user, dealership,
                   idempotency_record, outbox_event, failed_login_attempt
                   RESTART IDENTITY CASCADE
  `);

  console.log('Seeding dealerships...');
  const [dA, dB] = (await ds.query(`
    INSERT INTO dealership (name, timezone) VALUES
      ('NYC Auto Service', 'America/New_York'),
      ('LA Auto Service', 'America/Los_Angeles')
    RETURNING id, name
  `)) as Array<{ id: string; name: string }>;

  if (!dA || !dB) throw new Error('Dealership seed failed');

  console.log('Seeding skills...');
  const skills = (await ds.query(`
    INSERT INTO skill (code, name) VALUES
      ('OIL_CHANGE', 'Oil Change'),
      ('BRAKES', 'Brake Service'),
      ('TIRE', 'Tire Service'),
      ('EV_CERTIFIED', 'EV Certified')
    RETURNING id, code
  `)) as Array<{ id: string; code: string }>;
  const skillByCode = Object.fromEntries(skills.map((s) => [s.code, s.id]));

  // Hash the demo password ONCE (argon2id is slow on purpose; ~150ms each).
  // Demo creds — call this out in the README:
  //   admin@nyc-auto.local / Demo1234!
  //   admin@la-auto.local  / Demo1234!
  const DEMO_PASSWORD = 'Demo1234!';
  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });

  for (const dealership of [dA, dB]) {
    const dealershipId = dealership.id;
    const isNYC = dealership.name.includes('NYC');

    // App user — login with email above + password "Demo1234!"
    const [user] = (await ds.query(
      `INSERT INTO app_user (dealership_id, email, password_hash, roles)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [
        dealershipId,
        isNYC ? 'admin@nyc-auto.local' : 'admin@la-auto.local',
        passwordHash,
        ['service_advisor', 'manager'],
      ],
    )) as Array<{ id: string }>;
    if (!user) throw new Error('app_user seed failed');

    // 10 realistic customers per dealership
    const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'];
    const LAST_NAMES = ['Nguyen', 'Tran', 'Le', 'Pham', 'Hoang', 'Vu', 'Dang', 'Bui', 'Do', 'Ngo'];
    const tag = isNYC ? 'nyc' : 'la';
    const customerValues = FIRST_NAMES.map((first, i) => {
      const last = LAST_NAMES[i]!;
      const phone = `+1-555-${String(isNYC ? 1000 + i : 2000 + i).padStart(4, '0')}`;
      return `('${dealershipId}', '${first}', '${last}', '${first.toLowerCase()}.${tag}@example.com', '${phone}')`;
    }).join(',\n        ');

    const customers = (await ds.query(
      `INSERT INTO customer (dealership_id, first_name, last_name, email, phone) VALUES
        ${customerValues}
       RETURNING id`,
    )) as Array<{ id: string }>;

    // 1–2 vehicles per customer (mix of brands so the demo looks realistic)
    const VEHICLE_TEMPLATES = [
      { make: 'Toyota', model: 'Camry', year: 2022 },
      { make: 'Tesla', model: 'Model 3', year: 2023 },
      { make: 'Honda', model: 'CR-V', year: 2021 },
      { make: 'Ford', model: 'F-150', year: 2020 },
      { make: 'Subaru', model: 'Outback', year: 2024 },
      { make: 'Hyundai', model: 'Ioniq 5', year: 2024 },
      { make: 'BMW', model: '3 Series', year: 2022 },
      { make: 'Mazda', model: 'CX-5', year: 2023 },
      { make: 'Nissan', model: 'Altima', year: 2021 },
      { make: 'Volkswagen', model: 'Golf', year: 2022 },
    ];
    const vinPrefix = isNYC ? 'NY' : 'LA';
    for (const [idx, c] of customers.entries()) {
      const v1 = VEHICLE_TEMPLATES[idx % VEHICLE_TEMPLATES.length]!;
      const v2 = VEHICLE_TEMPLATES[(idx + 3) % VEHICLE_TEMPLATES.length]!;
      const giveSecond = idx % 2 === 0;
      const rows = [
        `('${dealershipId}', '${c.id}', '${vinPrefix}${String(idx).padStart(2, '0')}${v1.make.toUpperCase().padEnd(8, 'X').slice(0, 8)}A001', '${v1.make}', '${v1.model}', ${v1.year})`,
      ];
      if (giveSecond) {
        rows.push(
          `('${dealershipId}', '${c.id}', '${vinPrefix}${String(idx).padStart(2, '0')}${v2.make.toUpperCase().padEnd(8, 'X').slice(0, 8)}B002', '${v2.make}', '${v2.model}', ${v2.year})`,
        );
      }
      await ds.query(
        `INSERT INTO vehicle (dealership_id, customer_id, vin, make, model, year) VALUES ${rows.join(', ')}`,
      );
    }

    // Service types
    await ds.query(
      `INSERT INTO service_type (dealership_id, name, duration_minutes, buffer_minutes, required_skill_id) VALUES
        ($1, 'Oil Change', 30, 10, $2),
        ($1, 'Brake Pad Replacement', 90, 15, $3),
        ($1, 'Tire Rotation', 45, 10, $4)`,
      [dealershipId, skillByCode['OIL_CHANGE'], skillByCode['BRAKES'], skillByCode['TIRE']],
    );

    // Bays
    await ds.query(
      `INSERT INTO bay (dealership_id, name, is_active) VALUES
        ($1, 'Bay 1', true),
        ($1, 'Bay 2', true)`,
      [dealershipId],
    );

    // Technicians
    const technicians = (await ds.query(
      `INSERT INTO technician (dealership_id, first_name, last_name, employee_code) VALUES
        ($1, 'Charlie', 'Le', 'T001'),
        ($1, 'Diana', 'Pham', 'T002')
       RETURNING id`,
      [dealershipId],
    )) as Array<{ id: string }>;

    // Technician skills
    if (technicians[0]) {
      await ds.query(
        `INSERT INTO technician_skill (technician_id, skill_id) VALUES
          ($1, $2), ($1, $3), ($1, $4)`,
        [technicians[0].id, skillByCode['OIL_CHANGE'], skillByCode['BRAKES'], skillByCode['TIRE']],
      );
    }
    if (technicians[1]) {
      await ds.query(
        `INSERT INTO technician_skill (technician_id, skill_id) VALUES
          ($1, $2), ($1, $3)`,
        [technicians[1].id, skillByCode['OIL_CHANGE'], skillByCode['EV_CERTIFIED']],
      );
    }

    // Technician shifts: Mon-Fri 8-17, Sat 9-13
    for (const tech of technicians) {
      for (const dow of [1, 2, 3, 4, 5]) {
        await ds.query(
          `INSERT INTO technician_shift (technician_id, day_of_week, shift_start, shift_end)
           VALUES ($1, $2, '08:00', '17:00')`,
          [tech.id, dow],
        );
      }
      await ds.query(
        `INSERT INTO technician_shift (technician_id, day_of_week, shift_start, shift_end)
         VALUES ($1, 6, '09:00', '13:00')`,
        [tech.id],
      );
    }

    // Business hours: Mon-Fri 8-18, Sat 9-14, Sun closed (no row)
    for (const dow of [1, 2, 3, 4, 5]) {
      await ds.query(
        `INSERT INTO business_hours (dealership_id, day_of_week, open_time, close_time)
         VALUES ($1, $2, '08:00', '18:00')`,
        [dealershipId, dow],
      );
    }
    await ds.query(
      `INSERT INTO business_hours (dealership_id, day_of_week, open_time, close_time)
       VALUES ($1, 6, '09:00', '14:00')`,
      [dealershipId],
    );
  }

  console.log('Seed complete.');
  console.log('');
  console.log('Demo login credentials:');
  console.log('  admin@nyc-auto.local / Demo1234!  (NYC dealership, America/New_York)');
  console.log('  admin@la-auto.local  / Demo1234!  (LA dealership, America/Los_Angeles)');
  console.log('');
  await ds.destroy();
}

void seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
