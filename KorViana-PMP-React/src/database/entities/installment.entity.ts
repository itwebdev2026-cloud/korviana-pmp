import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'installments' })
export class Installment {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Column({ name: 'installment_number', type: 'integer' })
  installmentNumber!: number;

  @Column({ name: 'due_date', type: 'date' })
  dueDate!: string;

  @Column({ type: 'numeric', precision: 14, scale: 2 })
  amount!: string;

  @Column({ name: 'paid_amount', type: 'numeric', precision: 14, scale: 2, default: 0 })
  paidAmount!: string;

  @Column({ type: 'varchar', length: 16, default: 'upcoming' })
  status!: string;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
