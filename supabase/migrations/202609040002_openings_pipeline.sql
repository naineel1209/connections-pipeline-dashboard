create table public.openings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  company text not null check (char_length(trim(company)) > 0),
  role text,
  job_url text,
  applied_on_portal boolean not null default false,
  is_open boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.connections add column opening_id uuid references public.openings(id) on delete cascade;

insert into public.openings (owner_id, company, role, job_url, is_open)
select
  owner_id,
  coalesce(nullif(trim(company), ''), 'Unspecified company'),
  nullif(trim(target_job), ''),
  nullif(trim(job_url), ''),
  bool_or(status <> 'Closed')
from public.connections
where opening_id is null
group by owner_id, coalesce(nullif(trim(company), ''), 'Unspecified company'), nullif(trim(target_job), ''), nullif(trim(job_url), '');

update public.connections as connection
set opening_id = opening.id
from public.openings as opening
where connection.opening_id is null
  and opening.owner_id = connection.owner_id
  and opening.company = coalesce(nullif(trim(connection.company), ''), 'Unspecified company')
  and opening.role is not distinct from nullif(trim(connection.target_job), '')
  and opening.job_url is not distinct from nullif(trim(connection.job_url), '');

alter table public.connections alter column opening_id set not null;
alter table public.connections alter column sort_order type bigint;
alter table public.connections drop constraint if exists connections_status_check;
update public.connections set status = case status
  when 'New' then 'Pending'
  when 'Contacted' then 'Accepted'
  when 'Follow up' then 'Messaged'
  when 'Referred' then 'Cracked'
  when 'Applied' then 'Cracked'
  when 'Closed' then 'Closed'
  else 'Pending'
end;
alter table public.connections add constraint connections_status_check
  check (status in ('Pending', 'Accepted', 'Messaged', 'Cracked', 'Closed'));
alter table public.connections alter column status set default 'Pending';

create index openings_owner_company_idx on public.openings (owner_id, company);
create index connections_opening_order_idx on public.connections (opening_id, sort_order);
create trigger openings_updated_at before update on public.openings
  for each row execute procedure public.set_updated_at();

alter table public.openings enable row level security;
create policy "Users manage their openings" on public.openings
  for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
