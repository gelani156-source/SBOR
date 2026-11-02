-- SBOR: Stage 2, cloud schema. Run in a NEW Supabase project.
-- Authentication/membership required. Guest share links are NOT enabled in this stage.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Участник' check (length(display_name) between 1 and 80),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  title text not null check (length(title) between 1 and 120),
  destination text not null default '',
  starts_on date,
  ends_on date,
  currency text not null default 'RUB' check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'planning' check (status in ('planning','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_dates_ok check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

-- The trip owner cannot be replaced through ordinary member edits.
create or replace function public.sbor_keep_owner()
returns trigger language plpgsql set search_path = '' as $$
begin
 if new.owner_id is distinct from old.owner_id then
  raise exception 'Trip owner is immutable';
 end if;
 return new;
end; $$;
drop trigger if exists sbor_trips_keep_owner on public.trips;
create trigger sbor_trips_keep_owner before update on public.trips
 for each row execute function public.sbor_keep_owner();

create table if not exists public.trip_members (
  trip_id uuid not null references public.trips(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check(role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key(trip_id,user_id)
);

-- SECURITY DEFINER avoids recursive membership RLS lookups.
create or replace function public.sbor_is_member(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.trip_members where trip_id=p_trip and user_id=(select auth.uid()));
$$;
create or replace function public.sbor_is_admin(p_trip uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists (select 1 from public.trip_members where trip_id=p_trip and user_id=(select auth.uid()) and role in ('owner','admin'));
$$;
revoke all on function public.sbor_is_member(uuid) from public;
revoke all on function public.sbor_is_admin(uuid) from public;
grant execute on function public.sbor_is_member(uuid) to authenticated;
grant execute on function public.sbor_is_admin(uuid) to authenticated;

create or replace function public.sbor_add_owner()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.trip_members(trip_id,user_id,role) values(new.id,new.owner_id,'owner');
 return new;
end; $$;
drop trigger if exists sbor_trip_owner on public.trips;
create trigger sbor_trip_owner after insert on public.trips for each row execute function public.sbor_add_owner();

create or replace function public.sbor_set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at=now(); return new; end; $$;
drop trigger if exists sbor_trips_touch on public.trips;
create trigger sbor_trips_touch before update on public.trips for each row execute function public.sbor_set_updated_at();

create table if not exists public.places (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null check(length(title) between 1 and 120),
 kind text not null default 'other',
 visit_date date,
 visit_time time,
 duration_minutes integer check(duration_minutes between 0 and 1440),
 address text not null default '',
 source_url text,
 estimated_cost numeric(14,2) check (estimated_cost >= 0),
 note text not null default '' check(length(note)<=3000),
 visited boolean not null default false,
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);
create index if not exists sbor_places_trip_day on public.places(trip_id,visit_date,visit_time);

create table if not exists public.ideas (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null check(length(title) between 1 and 120),
 note text not null default '',
 voting_mode text not null default 'open' check(voting_mode in ('open','secret')),
 voting_state text not null default 'open' check(voting_state in ('open','closed')),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);

-- Secret voting intentionally NOT in this first database stage: requires
-- a server-controlled reveal pathway, not client-readable votes.

create table if not exists public.tasks (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null check(length(title) between 1 and 300),
 done boolean not null default false,
 due_at timestamptz,
 assigned_to uuid references auth.users(id),
 created_by uuid not null references auth.users(id),
 created_at timestamptz not null default now()
);

create table if not exists public.expenses (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 title text not null check(length(title) between 1 and 200),
 amount numeric(14,2) not null check(amount>0),
 currency text not null default 'RUB' check(currency ~ '^[A-Z]{3}$'),
 paid_by uuid not null references auth.users(id),
 created_by uuid not null references auth.users(id),
 occurred_at timestamptz not null default now(),
 created_at timestamptz not null default now()
);
-- Splits/settlements will be added as a separate reviewed migration.

create table if not exists public.messages (
 id uuid primary key default gen_random_uuid(),
 trip_id uuid not null references public.trips(id) on delete cascade,
 author_id uuid not null references auth.users(id),
 body text not null check(length(body) between 1 and 4000),
 created_at timestamptz not null default now()
);
create index if not exists sbor_messages_trip_at on public.messages(trip_id,created_at);

alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.places enable row level security;
alter table public.ideas enable row level security;
alter table public.tasks enable row level security;
alter table public.expenses enable row level security;
alter table public.messages enable row level security;

-- Profiles: own profile is editable, members can see each other's identity.
create policy sbor_profiles_select on public.profiles for select to authenticated using (
 id=(select auth.uid()) or exists (
 select 1 from public.trip_members mine
 join public.trip_members theirs on theirs.trip_id=mine.trip_id
 where mine.user_id=(select auth.uid()) and theirs.user_id=profiles.id
 ));
create policy sbor_profiles_insert on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy sbor_profiles_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));

create policy sbor_trips_select on public.trips for select to authenticated using(public.sbor_is_member(id));
create policy sbor_trips_insert on public.trips for insert to authenticated with check(owner_id=(select auth.uid()));
create policy sbor_trips_update on public.trips for update to authenticated using(public.sbor_is_member(id)) with check(public.sbor_is_member(id));
create policy sbor_trips_delete on public.trips for delete to authenticated using(owner_id=(select auth.uid()));

create policy sbor_members_select on public.trip_members for select to authenticated using(public.sbor_is_member(trip_id));
-- Membership administration is intentionally not exposed via direct client SQL.
-- Secure invite/accept/revoke RPCs will be implemented in the next stage.

create policy sbor_places_select on public.places for select to authenticated using(public.sbor_is_member(trip_id));
create policy sbor_places_insert on public.places for insert to authenticated with check(public.sbor_is_member(trip_id) and created_by=(select auth.uid()));
create policy sbor_places_update on public.places for update to authenticated using(public.sbor_is_member(trip_id)) with check(public.sbor_is_member(trip_id));
create policy sbor_places_delete on public.places for delete to authenticated using(public.sbor_is_member(trip_id));

create policy sbor_ideas_select on public.ideas for select to authenticated using(public.sbor_is_member(trip_id));
create policy sbor_ideas_insert on public.ideas for insert to authenticated with check(public.sbor_is_member(trip_id) and created_by=(select auth.uid()));
create policy sbor_ideas_update on public.ideas for update to authenticated using(public.sbor_is_member(trip_id)) with check(public.sbor_is_member(trip_id));
create policy sbor_ideas_delete on public.ideas for delete to authenticated using(public.sbor_is_member(trip_id));

create policy sbor_tasks_select on public.tasks for select to authenticated using(public.sbor_is_member(trip_id));
create policy sbor_tasks_insert on public.tasks for insert to authenticated with check(public.sbor_is_member(trip_id) and created_by=(select auth.uid()));
create policy sbor_tasks_update on public.tasks for update to authenticated using(public.sbor_is_member(trip_id)) with check(public.sbor_is_member(trip_id));
create policy sbor_tasks_delete on public.tasks for delete to authenticated using(public.sbor_is_member(trip_id));

create policy sbor_expenses_select on public.expenses for select to authenticated using(public.sbor_is_member(trip_id));
create policy sbor_expenses_insert on public.expenses for insert to authenticated with check(public.sbor_is_member(trip_id) and created_by=(select auth.uid()) and paid_by in(select user_id from public.trip_members where trip_id=expenses.trip_id));
create policy sbor_expenses_update on public.expenses for update to authenticated using(public.sbor_is_member(trip_id)) with check(public.sbor_is_member(trip_id));
create policy sbor_expenses_delete on public.expenses for delete to authenticated using(public.sbor_is_member(trip_id));

create policy sbor_messages_select on public.messages for select to authenticated using(public.sbor_is_member(trip_id));
create policy sbor_messages_insert on public.messages for insert to authenticated with check(public.sbor_is_member(trip_id) and author_id=(select auth.uid()));
create policy sbor_messages_delete on public.messages for delete to authenticated using(author_id=(select auth.uid()));

-- Harden grant defaults; RLS still applies to all authorized rows.
grant usage on schema public to authenticated;
grant select,insert,update,delete on public.profiles,public.trips,public.trip_members,public.places,public.ideas,public.tasks,public.expenses,public.messages to authenticated;

-- Future: realtime publication for changed tables, to be done only after subscription testing.
