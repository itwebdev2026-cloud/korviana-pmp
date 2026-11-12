import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'commissions' })
export class Commission {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'associate_id', type: 'uuid' })
  associateId!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'payment_id', type: 'uuid', nullable: true })
  paymentId!: string | null;

  @Column({ type: 'integer', default: 0 })
  level!: number;

  @Column({ type: 'numeric', precision: 7, scale: 4 })
  rate!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
