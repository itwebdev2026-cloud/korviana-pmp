import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'products' })
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  sku!: string;

  @Column({ type: 'varchar', length: 8 })
  metal!: 'gold' | 'silver';

  @Column({ type: 'varchar', length: 32 })
  purity!: string;

  @Column({ name: 'weight_grams', type: 'numeric', precision: 12, scale: 3 })
  weightGrams!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  price!: string;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
