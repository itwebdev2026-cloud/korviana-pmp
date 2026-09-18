-- KorViana Precious Metal Program database
-- Run this file in the Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'associate', 'admin')),
  kyc_status text not null default 'pending' check (kyc_status in ('pending', 'submitted', 'verified', 'rejected')),
  associate_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  metal text not null check (metal in ('gold', 'silver')),
  purity text not null,
  weight_grams numeric(12, 3) not null check (weight_grams > 0),
  price numeric(14, 2) not null check (price >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('PMP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))),
  customer_id uuid not null references public.profiles(id) on delete restrict,
  associate_id uuid references public.profiles(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  advance_amount numeric(14, 2) not null check (advance_amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'active', 'completed', 'cancelled', 'overdue')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.installments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  amount numeric(14, 2) not null check (amount > 0),
  paid_amount numeric(14, 2) not null default 0 check (paid_amount >= 0),
  status text not null default 'upcoming' check (status in ('upcoming', 'due', 'paid', 'overdue')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, installment_number)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  installment_id uuid references public.installments(id) on delete set null,
  customer_id uuid not null references public.profiles(id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  payment_method text not null default 'online' check (payment_method in ('online', 'bank_transfer', 'cash')),
  provider_reference text unique,
  status text not null default 'pending' check (status in ('pending', 'successful', 'failed', 'refunded')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  associate_id uuid not null references public.profiles(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete set null,
  level integer not null default 0 check (level >= 0),
  rate numeric(7, 4) not null check (rate >= 0),
  amount numeric(14, 2) not null check (amount >= 0),
  status text not null default 'pending' check (status in ('pending', 'eligible', 'paid', 'cancelled')),
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms', 'in_app')),
  subject text,
  body text not null,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists profiles_associate_id_idx on public.profiles(associate_id);
create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_associate_id_idx on public.orders(associate_id);
create index if not exists installments_order_id_idx on public.installments(order_id);
create index if not exists payments_customer_id_idx on public.payments(customer_id);
create index if not exists commissions_associate_id_idx on public.commissions(associate_id);
create index if not exists notifications_user_id_idx on public.notifications(user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

 drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

 drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();

 drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  if old.role <> new.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an administrator can change a profile role';
  end if;
  return new;
end;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do update set email = excluded.email, phone = excluded.phone;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists profiles_prevent_role_change on public.profiles;
create trigger profiles_prevent_role_change before update on public.profiles
for each row execute function public.prevent_profile_role_change();

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.installments enable row level security;
alter table public.payments enable row level security;
alter table public.commissions enable row level security;
alter table public.notifications enable row level security;

create policy "Profiles are visible to their owner, associates, and admins"
on public.profiles for select to authenticated
using (
  id = auth.uid()
  or associate_id = auth.uid()
  or public.is_admin()
);

create policy "Users can create their own profile"
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy "Users can update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "Products are visible to signed-in users"
on public.products for select to authenticated
using (active = true or public.is_admin());

create policy "Admins manage products"
on public.products for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Customers and associates can view relevant orders"
on public.orders for select to authenticated
using (customer_id = auth.uid() or associate_id = auth.uid() or public.is_admin());

create policy "Customers can create their own orders"
on public.orders for insert to authenticated
with check (customer_id = auth.uid());

create policy "Admins manage orders"
on public.orders for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users can view relevant installments"
on public.installments for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = auth.uid() or o.associate_id = auth.uid() or public.is_admin())
  )
);

create policy "Customers can view their payments"
on public.payments for select to authenticated
using (customer_id = auth.uid() or public.is_admin());

create policy "Customers can create their payments"
on public.payments for insert to authenticated
with check (customer_id = auth.uid());

create policy "Admins manage payments"
on public.payments for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Associates and admins can view commissions"
on public.commissions for select to authenticated
using (associate_id = auth.uid() or public.is_admin());

create policy "Admins manage commissions"
on public.commissions for all to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy "Users can view their notifications"
on public.notifications for select to authenticated
using (user_id = auth.uid() or public.is_admin());

create policy "Admins manage notifications"
on public.notifications for all to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.products (sku, metal, purity, weight_grams, price)
values
  ('AU-1', 'gold', '24K · 99.99%', 1, 7842),
  ('AU-2', 'gold', '24K · 99.99%', 2, 15684),
  ('AU-5', 'gold', '24K · 99.99%', 5, 39210),
  ('AU-10', 'gold', '24K · 99.99%', 10, 78420),
  ('AG-50', 'silver', '99.99%', 50, 4710),
  ('AG-100', 'silver', '99.99%', 100, 9420),
  ('AG-500', 'silver', '99.99%', 500, 47100),
  ('AG-1000', 'silver', '99.99%', 1000, 94200)
on conflict (sku) do nothing;
