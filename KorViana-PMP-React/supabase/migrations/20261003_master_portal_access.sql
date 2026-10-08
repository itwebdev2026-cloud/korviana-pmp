alter table public.profiles
  add column if not exists is_master boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_master_requires_admin'
  ) then
    alter table public.profiles
      add constraint profiles_master_requires_admin
      check (not is_master or role = 'admin');
  end if;
end;
$$;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security invoker
as $$
begin
  if (old.role is distinct from new.role or old.is_master is distinct from new.is_master)
    and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an administrator can change a profile role or master access';
  end if;
  return new;
end;
$$;

-- After the account exists in Supabase Auth, grant it master access in the SQL Editor:
-- update public.profiles
-- set role = 'admin', is_master = true
-- where lower(email) = lower('master@example.com');