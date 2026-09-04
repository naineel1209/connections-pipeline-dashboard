create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  headline text,
  message_template text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  profile_url text,
  target_job text,
  company text,
  job_url text,
  status text not null default 'New' check (status in ('New', 'Contacted', 'Follow up', 'Referred', 'Applied', 'Closed')),
  notes text,
  date_added date,
  sort_order bigint not null default 0,
  source_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, source_key)
);

create index connections_owner_status_order_idx on public.connections (owner_id, status, sort_order);
create index connections_owner_company_idx on public.connections (owner_id, company);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger connections_updated_at before update on public.connections
  for each row execute procedure public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.connections enable row level security;

create policy "Users manage their profile" on public.profiles
  for all to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Users manage their connections" on public.connections
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
