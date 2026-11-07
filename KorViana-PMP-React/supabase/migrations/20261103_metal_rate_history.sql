create table if not exists public.metal_rate_history (
  id bigint generated always as identity primary key,
  metal text not null check (metal in ('gold', 'silver')),
  rate_per_gram numeric(14, 2) not null check (rate_per_gram >= 0),
  recorded_at timestamptz not null default now()
);

create index if not exists metal_rate_history_metal_recorded_at_idx
  on public.metal_rate_history (metal, recorded_at desc);

alter table public.metal_rate_history enable row level security;

drop policy if exists "Metal rate history is public" on public.metal_rate_history;
create policy "Metal rate history is public"
on public.metal_rate_history for select to anon, authenticated
using (true);

grant select on public.metal_rate_history to anon, authenticated;
revoke insert, update, delete on public.metal_rate_history from anon, authenticated;

create or replace function public.record_metal_rate_history()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.metal_rate_history (metal, rate_per_gram)
    values (new.metal, new.rate_per_gram);
  elsif new.rate_per_gram is distinct from old.rate_per_gram then
    insert into public.metal_rate_history (metal, rate_per_gram)
    values (new.metal, new.rate_per_gram);
  end if;

  return new;
end;
$$;

revoke all on function public.record_metal_rate_history() from public, anon, authenticated;

drop trigger if exists record_metal_rate_history on public.metal_rates;
create trigger record_metal_rate_history
after insert or update of rate_per_gram on public.metal_rates
for each row execute function public.record_metal_rate_history();

insert into public.metal_rate_history (metal, rate_per_gram)
select rates.metal, rates.rate_per_gram
from public.metal_rates as rates
where not exists (
  select 1
  from public.metal_rate_history as history
  where history.metal = rates.metal
);
