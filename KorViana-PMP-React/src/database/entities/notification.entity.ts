import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'notifications' })
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  channel!: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
