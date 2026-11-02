create table if not exists public.metal_rates (
  metal text primary key check (metal in ('gold', 'silver')),
  rate_per_gram numeric(14, 2) not null check (rate_per_gram >= 0),
  updated_at timestamptz not null default now()
);

alter table public.metal_rates enable row level security;

drop policy if exists "Metal rates are public" on public.metal_rates;
create policy "Metal rates are public"
on public.metal_rates for select to anon, authenticated
using (true);

drop policy if exists "Admins manage metal rates" on public.metal_rates;
create policy "Admins manage metal rates"
on public.metal_rates for all to authenticated
using (public.is_admin())
with check (public.is_admin());

insert into public.metal_rates (metal, rate_per_gram)
values ('gold', 7842), ('silver', 94.2)
on conflict (metal) do nothing;
