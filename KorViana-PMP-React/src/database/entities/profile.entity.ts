import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type UserRole = 'customer' | 'associate' | 'admin';

@Entity({ name: 'profiles' })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'full_name', type: 'varchar', length: 160 })
  fullName!: string;

  @Column({ type: 'varchar', length: 254, unique: true })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100 })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 24, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'customer' })
  role!: UserRole;

  @Column({ name: 'is_master', type: 'boolean', default: false })
  isMaster!: boolean;

  @Column({ name: 'associate_id', type: 'uuid', nullable: true })
  associateId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
