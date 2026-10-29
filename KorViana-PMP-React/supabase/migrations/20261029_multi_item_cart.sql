create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null,
  metal text not null check (metal in ('gold', 'silver')),
  purity text not null,
  weight_grams numeric(12, 3) not null check (weight_grams > 0),
  quantity integer not null check (quantity between 1 and 99),
  unit_price numeric(14, 2) not null check (unit_price > 0),
  total_amount numeric(14, 2) not null check (total_amount > 0 and total_amount = unit_price * quantity),
  created_at timestamptz not null default now(),
  unique (order_id, sku)
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);

alter table public.order_items enable row level security;

drop policy if exists "Users can view relevant order items" on public.order_items;
create policy "Users can view relevant order items"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders o
    where o.id = order_id
      and (o.customer_id = auth.uid() or o.associate_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists "Admins manage order items" on public.order_items;
create policy "Admins manage order items"
on public.order_items for all to authenticated
using (public.is_admin())
with check (public.is_admin());
