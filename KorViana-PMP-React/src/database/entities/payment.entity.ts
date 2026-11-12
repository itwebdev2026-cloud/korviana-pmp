import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'installment_id', type: 'uuid', nullable: true })
  installmentId!: string | null;

  @Column({ name: 'customer_id', type: 'uuid' })
  customerId!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'payment_method', type: 'varchar', length: 20, default: 'online' })
  paymentMethod!: string;

  @Column({ name: 'provider_reference', type: 'varchar', length: 80, unique: true, nullable: true })
  providerReference!: string | null;

  @Column({ name: 'gateway_payment_id', type: 'varchar', length: 80, unique: true, nullable: true })
  gatewayPaymentId!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
