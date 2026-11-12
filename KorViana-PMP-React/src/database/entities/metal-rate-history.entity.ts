import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'metal_rate_history' })
export class MetalRateHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 8 })
  metal!: string;

  @Column({ name: 'base_rate', type: 'numeric', precision: 14, scale: 2 })
  baseRate!: string;

  @Column({ type: 'jsonb' })
  markups!: Record<string, number>;

  @Column({ name: 'changed_by', type: 'uuid', nullable: true })
  changedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
