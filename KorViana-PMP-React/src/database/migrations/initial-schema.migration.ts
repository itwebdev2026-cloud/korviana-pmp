import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1780000000000 implements MigrationInterface {
  name = 'InitialSchema1780000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        full_name varchar(160) NOT NULL,
        email varchar(254) NOT NULL UNIQUE,
        password_hash varchar(100) NOT NULL,
        phone varchar(24),
        role varchar(16) NOT NULL DEFAULT 'customer'
          CHECK (role IN ('customer', 'associate', 'admin')),
        is_master boolean NOT NULL DEFAULT false,
        associate_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        CHECK (NOT is_master OR role = 'admin')
      );

      CREATE TABLE products (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        sku varchar(32) NOT NULL UNIQUE,
        metal varchar(8) NOT NULL CHECK (metal IN ('gold', 'silver')),
        purity varchar(32) NOT NULL,
        weight_grams numeric(12, 3) NOT NULL CHECK (weight_grams > 0),
        price numeric(14, 2) NOT NULL CHECK (price >= 0),
        active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE orders (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_number varchar(24) NOT NULL UNIQUE
          DEFAULT ('PMP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
        customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        associate_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        total_amount numeric(14, 2) NOT NULL CHECK (total_amount >= 0),
        advance_amount numeric(14, 2) NOT NULL CHECK (advance_amount >= 0),
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'confirmed', 'active', 'completed', 'cancelled', 'overdue')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE order_items (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        product_id uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        sku varchar(32) NOT NULL,
        metal varchar(8) NOT NULL CHECK (metal IN ('gold', 'silver')),
        purity varchar(32) NOT NULL,
        weight_grams numeric(12, 3) NOT NULL CHECK (weight_grams > 0),
        quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 99),
        unit_price numeric(14, 2) NOT NULL CHECK (unit_price > 0),
        total_amount numeric(14, 2) NOT NULL CHECK (total_amount = unit_price * quantity),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (order_id, sku)
      );

      CREATE TABLE payments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        customer_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        amount numeric(14, 2) NOT NULL CHECK (amount > 0),
        payment_method varchar(20) NOT NULL DEFAULT 'online'
          CHECK (payment_method IN ('online', 'bank_transfer', 'cash')),
        provider_reference varchar(80) UNIQUE,
        gateway_payment_id varchar(80) UNIQUE,
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'successful', 'failed', 'refunded')),
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE installments (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
        installment_number integer NOT NULL CHECK (installment_number > 0),
        due_date date NOT NULL,
        amount numeric(14, 2) NOT NULL CHECK (amount > 0),
        paid_amount numeric(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        status varchar(16) NOT NULL DEFAULT 'upcoming'
          CHECK (status IN ('upcoming', 'due', 'paid', 'overdue')),
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (order_id, installment_number)
      );

      ALTER TABLE payments
        ADD COLUMN installment_id uuid REFERENCES installments(id) ON DELETE SET NULL;

      CREATE TABLE commissions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        associate_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
        order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        payment_id uuid REFERENCES payments(id) ON DELETE SET NULL,
        level integer NOT NULL DEFAULT 0 CHECK (level >= 0),
        rate numeric(7, 4) NOT NULL CHECK (rate >= 0),
        amount numeric(14, 2) NOT NULL CHECK (amount >= 0),
        status varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'eligible', 'paid', 'cancelled')),
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE notifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        channel varchar(16) NOT NULL CHECK (channel IN ('email', 'sms', 'in_app')),
        subject varchar(200),
        body text NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'queued'
          CHECK (status IN ('queued', 'sent', 'failed')),
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE metal_rates (
        metal varchar(8) PRIMARY KEY CHECK (metal IN ('gold', 'silver')),
        base_rate numeric(14, 2) NOT NULL CHECK (base_rate > 0),
        markups jsonb NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE metal_rate_history (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        metal varchar(8) NOT NULL CHECK (metal IN ('gold', 'silver')),
        base_rate numeric(14, 2) NOT NULL CHECK (base_rate > 0),
        markups jsonb NOT NULL,
        changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX profiles_associate_id_idx ON profiles(associate_id);
      CREATE INDEX orders_customer_id_idx ON orders(customer_id);
      CREATE INDEX orders_associate_id_idx ON orders(associate_id);
      CREATE INDEX order_items_order_id_idx ON order_items(order_id);
      CREATE INDEX installments_order_id_idx ON installments(order_id);
      CREATE INDEX payments_customer_id_idx ON payments(customer_id);
      CREATE INDEX payments_installment_id_idx ON payments(installment_id);
      CREATE INDEX commissions_associate_id_idx ON commissions(associate_id);
      CREATE INDEX notifications_user_id_idx ON notifications(user_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE metal_rate_history;
      DROP TABLE metal_rates;
      DROP TABLE notifications;
      DROP TABLE commissions;
      DROP TABLE installments;
      DROP TABLE payments;
      DROP TABLE order_items;
      DROP TABLE orders;
      DROP TABLE products;
      DROP TABLE profiles;
    `);
  }
}
