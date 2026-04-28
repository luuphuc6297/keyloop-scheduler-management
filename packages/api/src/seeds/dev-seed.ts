import 'dotenv/config';
import { DataSource } from 'typeorm';

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

  for (const dealership of [dA, dB]) {
    const dealershipId = dealership.id;
    const isNYC = dealership.name.includes('NYC');
    const passwordHash = '$argon2id$v=19$m=65536,t=3,p=4$placeholder$placeholder';

    // App user (Phase 3 will replace placeholder hash with real argon2 output)
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

    // 2 customers
    const customers = (await ds.query(
      `INSERT INTO customer (dealership_id, first_name, last_name, email, phone) VALUES
        ($1, 'Alice', 'Nguyen', 'alice.${isNYC ? 'nyc' : 'la'}@example.com', '+1-555-0001'),
        ($1, 'Bob', 'Tran', 'bob.${isNYC ? 'nyc' : 'la'}@example.com', '+1-555-0002')
       RETURNING id`,
      [dealershipId],
    )) as Array<{ id: string }>;

    // 2 vehicles per customer
    for (const [idx, c] of customers.entries()) {
      const vinPrefix = isNYC ? 'NY' : 'LA';
      await ds.query(
        `INSERT INTO vehicle (dealership_id, customer_id, vin, make, model, year) VALUES
          ($1, $2, $3, 'Toyota', 'Camry', 2022),
          ($1, $2, $4, 'Tesla', 'Model 3', 2023)`,
        [dealershipId, c.id, `${vinPrefix}${idx}TOYOTA0000000001`, `${vinPrefix}${idx}TESLA00000000002`],
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
  await ds.destroy();
}

void seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
