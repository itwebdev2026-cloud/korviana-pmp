import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'order_items' })
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ type: 'varchar', length: 32 })
  sku!: string;

  @Column({ type: 'varchar', length: 8 })
  metal!: string;

  @Column({ type: 'varchar', length: 32 })
  purity!: string;

  @Column({ name: 'weight_grams', type: 'numeric', precision: 12, scale: 3 })
  weightGrams!: string;

  @Column({ type: 'integer' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'numeric', precision: 14, scale: 2 })
  unitPrice!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2 })
  totalAmount!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
