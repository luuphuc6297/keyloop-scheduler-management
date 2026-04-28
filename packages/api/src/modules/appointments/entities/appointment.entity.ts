import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { AppointmentStatus } from './appointment-status.enum';

/**
 * Appointment — heart of the scheduler.
 *
 * Note: TypeORM does not natively support tstzrange. The column is mapped as text;
 * read/write goes through repository methods that produce/consume the literal
 * `[<lower>,<upper>)` form via raw SQL where needed. EXCLUDE constraints are defined
 * in the migration (1700000000002), not via decorator metadata.
 */
@Entity({ name: 'appointment' })
@Index(['dealershipId', 'status'])
@Index(['customerId'])
@Index(['vehicleId'])
@Index(['technicianId'])
export class Appointment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'dealership_id', type: 'uuid' })
  dealershipId!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'vehicle_id', type: 'uuid' })
  vehicleId!: string;

  @Column({ name: 'service_type_id', type: 'uuid' })
  serviceTypeId!: string;

  @Column({ name: 'technician_id', type: 'uuid' })
  technicianId!: string;

  @Column({ name: 'bay_id', type: 'uuid' })
  bayId!: string;

  /**
   * Postgres tstzrange. Read with `lower(time_range)` / `upper(time_range)` in queries
   * or use raw value of form `[2026-05-01T13:00:00Z,2026-05-01T13:30:00Z)`.
   */
  @Column({ name: 'time_range', type: 'tstzrange' })
  timeRange!: string;

  @Column({
    type: 'enum',
    enum: AppointmentStatus,
    enumName: 'appointment_status',
    default: AppointmentStatus.CONFIRMED,
  })
  status!: AppointmentStatus;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
