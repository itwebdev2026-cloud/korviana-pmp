import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'orders' })
export class OrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_number', type: 'varchar', length: 24, unique: true })
  orderNumber!: string;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ name: 'associate_id', type: 'uuid', nullable: true })
  associateId!: string | null;

  @Column({ name: 'product_id', type: 'uuid' })
  productId!: string;

  @Column({ name: 'total_amount', type: 'numeric', precision: 14, scale: 2 })
  totalAmount!: string;

  @Column({ name: 'advance_amount', type: 'numeric', precision: 14, scale: 2 })
  advanceAmount!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
