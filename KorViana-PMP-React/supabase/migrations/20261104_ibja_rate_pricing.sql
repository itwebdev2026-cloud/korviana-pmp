create table if not exists public.metal_rate_settings (
  metal text primary key check (metal in ('gold', 'silver')),
  ibja_rate numeric(14, 2) not null check (ibja_rate > 0),
  base_unit_grams integer not null check (
    (metal = 'gold' and base_unit_grams = 10)
    or (metal = 'silver' and base_unit_grams = 1000)
  ),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.metal_rate_markups (
  metal text not null check (metal in ('gold', 'silver')),
  weight_grams integer not null check (
    (metal = 'gold' and weight_grams in (1, 2, 5, 10, 50, 100))
    or (metal = 'silver' and weight_grams in (50, 100, 200, 500, 1000))
  ),
  markup_percent numeric(5, 2) not null check (markup_percent between 0 and 100),
  updated_at timestamptz not null default now(),
  primary key (metal, weight_grams)
);

create table if not exists public.metal_pricing_history (
  id bigint generated always as identity primary key,
  metal text not null check (metal in ('gold', 'silver')),
  weight_grams integer not null,
  ibja_rate numeric(14, 2) not null,
  base_unit_grams integer not null,
  markup_percent numeric(5, 2) not null,
  raw_rate numeric(18, 6) not null,
  final_rate numeric(14, 0) not null,
  changed_by uuid references public.profiles(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create index if not exists metal_pricing_history_recorded_at_idx
  on public.metal_pricing_history (recorded_at desc);

alter table public.metal_rate_settings enable row level security;
alter table public.metal_rate_markups enable row level security;
alter table public.metal_pricing_history enable row level security;

drop policy if exists "Published IBJA rates are public" on public.metal_rate_settings;
create policy "Published IBJA rates are public"
on public.metal_rate_settings for select to anon, authenticated
using (true);

drop policy if exists "Published rate markups are public" on public.metal_rate_markups;
create policy "Published rate markups are public"
on public.metal_rate_markups for select to anon, authenticated
using (true);

drop policy if exists "Admins view metal pricing history" on public.metal_pricing_history;
create policy "Admins view metal pricing history"
on public.metal_pricing_history for select to authenticated
using (public.is_admin());

revoke all on public.metal_rate_settings, public.metal_rate_markups, public.metal_pricing_history
  from anon, authenticated;
grant select on public.metal_rate_settings, public.metal_rate_markups to anon, authenticated;
grant select on public.metal_pricing_history to authenticated;

insert into public.metal_rate_settings (metal, ibja_rate, base_unit_grams)
select 'gold', coalesce(
  (select rate_per_gram * 10 from public.metal_rates where metal = 'gold'),
  78420
), 10
union all
select 'silver', coalesce(
  (select rate_per_gram * 1000 from public.metal_rates where metal = 'silver'),
  94200
), 1000
on conflict (metal) do nothing;

insert into public.metal_rate_markups (metal, weight_grams, markup_percent)
values
  ('gold', 1, 6.25),
  ('gold', 2, 5.50),
  ('gold', 5, 5.00),
  ('gold', 10, 4.75),
  ('gold', 50, 4.50),
  ('gold', 100, 4.25),
  ('silver', 50, 6.25),
  ('silver', 100, 5.50),
  ('silver', 200, 5.00),
  ('silver', 500, 4.75),
  ('silver', 1000, 4.50)
on conflict (metal, weight_grams) do nothing;

create or replace function public.calculate_korviana_rate(
  p_ibja_rate numeric,
  p_base_unit_grams integer,
  p_weight_grams integer,
  p_markup_percent numeric
)
returns numeric
language sql
immutable
strict
set search_path = pg_catalog
as $$
  select round(
    (p_ibja_rate / p_base_unit_grams)
    * p_weight_grams
    * (1 + p_markup_percent / 100),
    0
  );
$$;

revoke all on function public.calculate_korviana_rate(numeric, integer, integer, numeric)
  from public, anon, authenticated;

create or replace function public.save_metal_pricing(
  p_gold_ibja_rate numeric,
  p_silver_ibja_rate numeric,
  p_markups jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_updated_at timestamptz := now();
  v_markup_count integer;
  v_unique_markup_count integer;
begin
  if not public.is_admin() then
    raise exception using errcode = '42501', message = 'Only administrators can update metal pricing.';
  end if;

  if p_gold_ibja_rate is null or p_gold_ibja_rate <= 0
    or p_silver_ibja_rate is null or p_silver_ibja_rate <= 0 then
    raise exception using errcode = '22023', message = 'Both IBJA rates must be greater than zero.';
  end if;
  if p_gold_ibja_rate <> round(p_gold_ibja_rate, 2)
    or p_silver_ibja_rate <> round(p_silver_ibja_rate, 2) then
    raise exception using errcode = '22023', message = 'IBJA rates can have at most two decimal places.';
  end if;

  if p_markups is null or jsonb_typeof(p_markups) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Exactly eleven denomination markups are required.';
  end if;

  if jsonb_array_length(p_markups) <> 11 then
    raise exception using errcode = '22023', message = 'Exactly eleven denomination markups are required.';
  end if;

  select count(*), count(distinct (input.metal, input.weight_grams))
  into v_markup_count, v_unique_markup_count
  from jsonb_to_recordset(p_markups) as input(
    metal text,
    weight_grams integer,
    markup_percent numeric
  );

  if v_markup_count <> 11 or v_unique_markup_count <> 11 then
    raise exception using errcode = '22023', message = 'Each denomination must have exactly one markup.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_markups) as input(
      metal text,
      weight_grams integer,
      markup_percent numeric
    )
    where input.metal is null
      or input.weight_grams is null
      or input.markup_percent is null
      or input.markup_percent < 0
      or input.markup_percent > 100
      or input.markup_percent <> round(input.markup_percent, 2)
      or not (
        (input.metal = 'gold' and input.weight_grams in (1, 2, 5, 10, 50, 100))
        or (input.metal = 'silver' and input.weight_grams in (50, 100, 200, 500, 1000))
      )
  ) then
    raise exception using errcode = '22023', message = 'A markup value is invalid or uses an unsupported denomination.';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_markups) as input(
      metal text,
      weight_grams integer,
      markup_percent numeric
    )
    where public.calculate_korviana_rate(
      case when input.metal = 'gold' then p_gold_ibja_rate else p_silver_ibja_rate end,
      case when input.metal = 'gold' then 10 else 1000 end,
      input.weight_grams,
      input.markup_percent
    ) < 1
    or public.calculate_korviana_rate(
      case when input.metal = 'gold' then p_gold_ibja_rate else p_silver_ibja_rate end,
      case when input.metal = 'gold' then 10 else 1000 end,
      input.weight_grams,
      input.markup_percent
    ) >= 1000000000000
  ) then
    raise exception using errcode = '22023', message = 'Calculated prices must be at least ₹1 and fit the product price range.';
  end if;

  insert into public.metal_rate_settings (metal, ibja_rate, base_unit_grams, updated_at, updated_by)
  values
    ('gold', p_gold_ibja_rate, 10, v_updated_at, auth.uid()),
    ('silver', p_silver_ibja_rate, 1000, v_updated_at, auth.uid())
  on conflict (metal) do update
  set ibja_rate = excluded.ibja_rate,
      base_unit_grams = excluded.base_unit_grams,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by;

  insert into public.metal_rate_markups (metal, weight_grams, markup_percent, updated_at)
  select input.metal, input.weight_grams, input.markup_percent, v_updated_at
  from jsonb_to_recordset(p_markups) as input(
    metal text,
    weight_grams integer,
    markup_percent numeric
  )
  on conflict (metal, weight_grams) do update
  set markup_percent = excluded.markup_percent,
      updated_at = excluded.updated_at;

  update public.products as product
  set active = false,
      updated_at = v_updated_at
  where product.metal in ('gold', 'silver')
    and not exists (
      select 1
      from public.metal_rate_markups as markup
      where markup.metal = product.metal
        and markup.weight_grams = product.weight_grams
    );

  insert into public.products (sku, metal, purity, weight_grams, price, active, updated_at)
  select
    case when setting.metal = 'gold' then 'AU-' else 'AG-' end || markup.weight_grams,
    setting.metal,
    case when setting.metal = 'gold' then '24K · 99.99%' else '99.99%' end,
    markup.weight_grams,
    public.calculate_korviana_rate(
      setting.ibja_rate,
      setting.base_unit_grams,
      markup.weight_grams,
      markup.markup_percent
    )::numeric(14, 2),
    true,
    v_updated_at
  from public.metal_rate_settings as setting
  join public.metal_rate_markups as markup using (metal)
  on conflict (sku) do update
  set metal = excluded.metal,
      purity = excluded.purity,
      weight_grams = excluded.weight_grams,
      price = excluded.price,
      active = true,
      updated_at = excluded.updated_at;

  insert into public.metal_pricing_history (
    metal,
    weight_grams,
    ibja_rate,
    base_unit_grams,
    markup_percent,
    raw_rate,
    final_rate,
    changed_by,
    recorded_at
  )
  select
    setting.metal,
    markup.weight_grams,
    setting.ibja_rate,
    setting.base_unit_grams,
    markup.markup_percent,
    (setting.ibja_rate / setting.base_unit_grams) * markup.weight_grams,
    public.calculate_korviana_rate(
      setting.ibja_rate,
      setting.base_unit_grams,
      markup.weight_grams,
      markup.markup_percent
    ),
    auth.uid(),
    v_updated_at
  from public.metal_rate_settings as setting
  join public.metal_rate_markups as markup using (metal);

  return v_updated_at;
end;
$$;

revoke all on function public.save_metal_pricing(numeric, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.save_metal_pricing(numeric, numeric, jsonb) to authenticated;

update public.products as product
set active = false,
    updated_at = now()
where product.metal in ('gold', 'silver')
  and not exists (
    select 1
    from public.metal_rate_markups as markup
    where markup.metal = product.metal
      and markup.weight_grams = product.weight_grams
  );

insert into public.products (sku, metal, purity, weight_grams, price)
select
  case when setting.metal = 'gold' then 'AU-' else 'AG-' end || markup.weight_grams,
  setting.metal,
  case when setting.metal = 'gold' then '24K · 99.99%' else '99.99%' end,
  markup.weight_grams,
  public.calculate_korviana_rate(
    setting.ibja_rate,
    setting.base_unit_grams,
    markup.weight_grams,
    markup.markup_percent
  )::numeric(14, 2)
from public.metal_rate_settings as setting
join public.metal_rate_markups as markup using (metal)
on conflict (sku) do update
set metal = excluded.metal,
    purity = excluded.purity,
    weight_grams = excluded.weight_grams,
    price = excluded.price,
    active = true,
    updated_at = now();

insert into public.metal_pricing_history (
  metal,
  weight_grams,
  ibja_rate,
  base_unit_grams,
  markup_percent,
  raw_rate,
  final_rate,
  changed_by
)
select
  setting.metal,
  markup.weight_grams,
  setting.ibja_rate,
  setting.base_unit_grams,
  markup.markup_percent,
  (setting.ibja_rate / setting.base_unit_grams) * markup.weight_grams,
  public.calculate_korviana_rate(
    setting.ibja_rate,
    setting.base_unit_grams,
    markup.weight_grams,
    markup.markup_percent
  ),
  null
from public.metal_rate_settings as setting
join public.metal_rate_markups as markup using (metal)
where not exists (select 1 from public.metal_pricing_history);
