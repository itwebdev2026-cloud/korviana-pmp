import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'metal_rates' })
export class MetalRate {
  @PrimaryColumn({ type: 'varchar', length: 8 })
  metal!: 'gold' | 'silver';

  @Column({ name: 'base_rate', type: 'numeric', precision: 14, scale: 2 })
  baseRate!: string;

  @Column({ type: 'jsonb' })
  markups!: Record<string, number>;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
