-- Robocon Hub — initial schema.
-- Run once in the Supabase SQL editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: every object is created with IF NOT EXISTS / OR REPLACE / ON CONFLICT.
--
-- Structure: season → robot → subsystems → modules → assets (+ asset_files in the exports bucket).
-- Access:    pending users see nothing; members read + add; leads approve, delete, mark as-built.

-- ─────────────────────────────────────────────────────────────────────────────
-- Types
-- ─────────────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.member_role as enum ('pending', 'member', 'lead', 'alum');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_status as enum ('concept', 'design', 'as_built', 'retired');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lane_code as enum ('SCH', 'PCB', 'FW', 'MECH', 'SIM');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.discipline as enum ('mech', 'elec', 'prog');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.asset_location as enum ('github', 'drive', 'storage', 'link');
exception when duplicate_object then null; end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Members
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.members (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null unique,
  full_name   text,
  avatar_url  text,
  role        public.member_role not null default 'pending',
  batch       text,                       -- e.g. '25/27'
  department  public.discipline,
  approved_by uuid references public.members (id) on delete set null,
  approved_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Emails that become a lead on first sign-in (bootstraps the very first admin).
create table if not exists public.bootstrap_leads (
  email text primary key
);
insert into public.bootstrap_leads (email) values ('23005199@siswa.um.edu.my')
on conflict do nothing;

create or replace function public.is_lead()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and role = 'lead');
$$;

create or replace function public.is_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where id = auth.uid() and role in ('member', 'lead'));
$$;

-- Creates the member row on first Google sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  boot boolean := exists (select 1 from public.bootstrap_leads b where lower(b.email) = lower(new.email));
begin
  insert into public.members (id, email, full_name, avatar_url, role, approved_at)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    case when boot then 'lead'::public.member_role else 'pending'::public.member_role end,
    case when boot then now() end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed in before this migration ran.
insert into public.members (id, email, full_name, avatar_url)
select u.id, u.email,
       coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
       u.raw_user_meta_data ->> 'avatar_url'
from auth.users u
on conflict (id) do nothing;

update public.members m set role = 'lead', approved_at = coalesce(m.approved_at, now())
where lower(m.email) in (select lower(email) from public.bootstrap_leads) and m.role <> 'lead';

-- Only leads change roles; the last lead can't be demoted. auth.uid() is null in the
-- SQL editor / service role, which is allowed so an admin can always recover access.
create or replace function public.guard_member_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.role is distinct from old.role then
    if auth.uid() is not null and not public.is_lead() then
      raise exception 'Only leads can change roles';
    end if;
    if old.role = 'lead' and new.role <> 'lead'
       and (select count(*) from public.members where role = 'lead') <= 1 then
      raise exception 'Cannot demote the last lead';
    end if;
    if new.role in ('member', 'lead') and old.role = 'pending' then
      new.approved_by := auth.uid();
      new.approved_at := now();
    end if;
  end if;
  if new.email is distinct from old.email and auth.uid() is not null then
    raise exception 'Email is managed by Google sign-in';
  end if;
  return new;
end $$;

drop trigger if exists guard_member_update on public.members;
create trigger guard_member_update
  before update on public.members
  for each row execute function public.guard_member_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- Club-wide reference data
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.subsystem_codes (
  code        text primary key check (code ~ '^[A-Z]{3}$'),
  name        text not null,
  description text,
  sort        int not null default 0
);

insert into public.subsystem_codes (code, name, sort) values
  ('DRV', 'Drivetrain', 1),
  ('ARM', 'Manipulator', 2),
  ('GRP', 'Gripper', 3),
  ('PWR', 'Power', 4),
  ('CTL', 'Control', 5),
  ('VIS', 'Vision', 6),
  ('PNU', 'Pneumatics', 7),
  ('FRM', 'Frame', 8)
on conflict (code) do nothing;

create table if not exists public.drives (
  id               uuid primary key default gen_random_uuid(),
  label            text not null unique,          -- 'DRIVE-A'
  custodian_id     uuid references public.members (id) on delete set null,
  notes            text,
  last_mirrored_at date,
  created_by       uuid default auth.uid() references public.members (id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Season → robot → subsystems → modules → assets
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.seasons (
  id          uuid primary key default gen_random_uuid(),
  year        int not null unique check (year between 2000 and 2099),
  prefix      text generated always as ('RC' || lpad((year % 100)::text, 2, '0')) stored,
  is_active   boolean not null default false,
  result      text,                 -- e.g. '2nd place'
  repo        text,                 -- 'rec-robocon2026/rc26-robot' — GitHub pushes register against this
  created_by  uuid default auth.uid() references public.members (id) on delete set null,
  created_at  timestamptz not null default now()
);
create unique index if not exists seasons_one_active on public.seasons (is_active) where is_active;

create table if not exists public.robots (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null unique references public.seasons (id) on delete cascade,
  codename    text not null,
  description text,
  created_by  uuid default auth.uid() references public.members (id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.subsystems (
  id         uuid primary key default gen_random_uuid(),
  robot_id   uuid not null references public.robots (id) on delete cascade,
  code       text not null references public.subsystem_codes (code),
  lead_id    uuid references public.members (id) on delete set null,
  notes      text,
  created_at timestamptz not null default now(),
  unique (robot_id, code)
);

create table if not exists public.modules (
  id           uuid primary key default gen_random_uuid(),
  subsystem_id uuid not null references public.subsystems (id) on delete cascade,
  name         text not null,
  slug         text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description  text,
  status       public.item_status not null default 'design',
  lanes        public.lane_code[] not null default '{}',
  parts_yml    text,
  carried_from uuid references public.modules (id) on delete set null,
  is_proven    boolean not null default false,   -- in the reuse library
  proven_note  text,
  created_by   uuid default auth.uid() references public.members (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (subsystem_id, slug)
);

create table if not exists public.assets (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.modules (id) on delete cascade,
  name        text not null,               -- RC26-DRV-WHEELMOD-A-v3
  title       text,                        -- 'Mecanum wheel module'
  kind        text not null,               -- 'CAD assembly', 'Schematic', 'Test log', …
  discipline  public.discipline not null,
  lane        public.lane_code,
  location    public.asset_location not null,
  drive_id    uuid references public.drives (id) on delete set null,
  path        text,                        -- drive folder or repo path
  url         text,                        -- GitHub / external link
  revision    int,
  status      public.item_status not null default 'design',
  notes       text,
  built_by    uuid references public.members (id) on delete set null,
  built_at    timestamptz,
  created_by  uuid default auth.uid() references public.members (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists assets_module_idx on public.assets (module_id);

create table if not exists public.asset_files (
  id           uuid primary key default gen_random_uuid(),
  asset_id     uuid not null references public.assets (id) on delete cascade,
  kind         text not null check (kind in ('step', 'pdf', 'stl', 'mesh', 'other')),
  storage_path text not null unique,
  file_name    text not null,
  size_bytes   bigint,
  uploaded_by  uuid default auth.uid() references public.members (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index if not exists asset_files_asset_idx on public.asset_files (asset_id);

-- History feed: written by triggers below and by the GitHub webhook (service role).
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  module_id  uuid references public.modules (id) on delete cascade,
  asset_id   uuid references public.assets (id) on delete set null,
  actor_id   uuid references public.members (id) on delete set null,
  actor_name text,
  action     text not null,
  detail     text,
  lane       public.lane_code,
  sha        text,
  branch     text,
  source     text not null default 'hub' check (source in ('hub', 'github')),
  created_at timestamptz not null default now()
);
create index if not exists events_module_idx on public.events (module_id, created_at desc);
create index if not exists events_created_idx on public.events (created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Business rules
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists modules_touch on public.modules;
create trigger modules_touch before update on public.modules
  for each row execute function public.touch_updated_at();
drop trigger if exists assets_touch on public.assets;
create trigger assets_touch before update on public.assets
  for each row execute function public.touch_updated_at();

-- Only leads mark something as-built.
create or replace function public.guard_as_built()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'as_built'
     and (tg_op = 'INSERT' or old.status is distinct from 'as_built')
     and auth.uid() is not null and not public.is_lead() then
    raise exception 'Only leads can mark something as-built';
  end if;
  if tg_table_name = 'assets' and new.status = 'as_built'
     and (tg_op = 'INSERT' or old.status is distinct from 'as_built') then
    new.built_by := auth.uid();
    new.built_at := now();
  end if;
  return new;
end $$;

drop trigger if exists assets_guard_as_built on public.assets;
create trigger assets_guard_as_built before insert or update on public.assets
  for each row execute function public.guard_as_built();
drop trigger if exists modules_guard_as_built on public.modules;
create trigger modules_guard_as_built before insert or update on public.modules
  for each row execute function public.guard_as_built();

-- Activity log.
create or replace function public.log_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'modules' then
    if tg_op = 'INSERT' then
      insert into public.events (module_id, actor_id, action, detail)
      values (new.id, auth.uid(),
              case when new.carried_from is null then 'module created' else 'module carried forward' end,
              new.name);
    elsif new.status is distinct from old.status then
      insert into public.events (module_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'status → ' || replace(new.status::text, '_', '-'), new.name);
    elsif new.is_proven and not old.is_proven then
      insert into public.events (module_id, actor_id, action, detail)
      values (new.id, auth.uid(), 'added to the reuse library', new.name);
    end if;
  elsif tg_table_name = 'assets' then
    if tg_op = 'INSERT' then
      insert into public.events (module_id, asset_id, actor_id, action, detail, lane)
      values (new.module_id, new.id, auth.uid(), 'added ' || lower(new.kind), new.name, new.lane);
    elsif new.status is distinct from old.status then
      insert into public.events (module_id, asset_id, actor_id, action, detail, lane)
      values (new.module_id, new.id, auth.uid(),
              case when new.status = 'as_built' then 'marked as-built'
                   else 'status → ' || replace(new.status::text, '_', '-') end,
              new.name, new.lane);
    end if;
  elsif tg_table_name = 'asset_files' then
    insert into public.events (module_id, asset_id, actor_id, action, detail, lane)
    select a.module_id, a.id, auth.uid(), 'uploaded ' || upper(new.kind), new.file_name, a.lane
    from public.assets a where a.id = new.asset_id;
  end if;
  return new;
end $$;

drop trigger if exists modules_log on public.modules;
create trigger modules_log after insert or update on public.modules
  for each row execute function public.log_event();
drop trigger if exists assets_log on public.assets;
create trigger assets_log after insert or update on public.assets
  for each row execute function public.log_event();
drop trigger if exists asset_files_log on public.asset_files;
create trigger asset_files_log after insert on public.asset_files
  for each row execute function public.log_event();

-- Asset health, used for the "messy / missing exports" flags on every page.
create or replace view public.asset_health with (security_invoker = on) as
select
  a.*,
  s.prefix       as season_prefix,
  s.year         as season_year,
  sub.code       as subsystem_code,
  m.name         as module_name,
  m.slug         as module_slug,
  exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'step') as has_step,
  exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'pdf')  as has_pdf,
  (a.name ~ '^RC[0-9]{2}-[A-Z]{3}-[A-Z0-9]{2,14}(-[A-Z])?-v[0-9]+$'
     and a.name like s.prefix || '-' || sub.code || '-%') as name_ok,
  (a.discipline = 'mech' and a.location = 'drive'
     and not (exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'step')
          and exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'pdf'))) as missing_exports
from public.assets a
join public.modules m     on m.id = a.module_id
join public.subsystems sub on sub.id = m.subsystem_id
join public.robots r      on r.id = sub.robot_id
join public.seasons s     on s.id = r.season_id;

-- Start a new season in one transaction: season + robot + subsystems + carried modules.
create or replace function public.start_season(
  p_year int,
  p_codename text,
  p_description text,
  p_codes text[],
  p_carry uuid[] default '{}',
  p_repo text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_season uuid;
  v_robot  uuid;
  v_code   text;
  v_src    record;
  v_sub    uuid;
begin
  if not public.is_lead() then
    raise exception 'Only leads can start a season';
  end if;

  update public.seasons set is_active = false where is_active;
  insert into public.seasons (year, is_active, repo) values (p_year, true, p_repo) returning id into v_season;
  insert into public.robots (season_id, codename, description)
    values (v_season, upper(trim(p_codename)), p_description) returning id into v_robot;

  foreach v_code in array coalesce(p_codes, '{}') loop
    insert into public.subsystems (robot_id, code) values (v_robot, v_code) on conflict do nothing;
  end loop;

  for v_src in
    select m.*, sub.code from public.modules m join public.subsystems sub on sub.id = m.subsystem_id
    where m.id = any (coalesce(p_carry, '{}'))
  loop
    insert into public.subsystems (robot_id, code) values (v_robot, v_src.code) on conflict do nothing;
    select id into v_sub from public.subsystems where robot_id = v_robot and code = v_src.code;
    insert into public.modules (subsystem_id, name, slug, description, lanes, parts_yml, carried_from, status)
    values (v_sub, v_src.name, v_src.slug, v_src.description, v_src.lanes, v_src.parts_yml, v_src.id, 'design');
  end loop;

  return v_season;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Row-level security
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.members         enable row level security;
alter table public.bootstrap_leads enable row level security;
alter table public.subsystem_codes enable row level security;
alter table public.drives          enable row level security;
alter table public.seasons         enable row level security;
alter table public.robots          enable row level security;
alter table public.subsystems      enable row level security;
alter table public.modules         enable row level security;
alter table public.assets          enable row level security;
alter table public.asset_files     enable row level security;
alter table public.events          enable row level security;

-- members: you always see yourself; approved members see everyone; leads manage.
drop policy if exists members_select on public.members;
create policy members_select on public.members for select to authenticated
  using (id = auth.uid() or public.is_member());
-- Lets someone whose row was removed (rejected) ask again — always as pending.
drop policy if exists members_insert_self on public.members;
create policy members_insert_self on public.members for insert to authenticated
  with check (id = auth.uid() and role = 'pending');
drop policy if exists members_update_self on public.members;
create policy members_update_self on public.members for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists members_update_lead on public.members;
create policy members_update_lead on public.members for update to authenticated
  using (public.is_lead()) with check (public.is_lead());
drop policy if exists members_delete_lead on public.members;
create policy members_delete_lead on public.members for delete to authenticated
  using (public.is_lead() and id <> auth.uid());

-- bootstrap_leads: no policies → invisible to clients.

-- Generic helpers for the content tables.
do $$
declare
  t text;
begin
  -- read: approved members
  foreach t in array array['subsystem_codes','drives','seasons','robots','subsystems','modules','assets','asset_files','events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_member())', t || '_select', t);
  end loop;

  -- lead-only writes: club structure
  foreach t in array array['subsystem_codes','drives','seasons','robots','subsystems'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_lead())', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_lead()) with check (public.is_lead())', t || '_update', t);
  end loop;

  -- member writes: the things people add
  foreach t in array array['modules','assets','asset_files'] loop
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.is_member())', t || '_insert', t);
  end loop;
  foreach t in array array['modules','assets'] loop
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.is_member()) with check (public.is_member())', t || '_update', t);
  end loop;

  -- deletes: leads only, everywhere
  foreach t in array array['subsystem_codes','drives','seasons','robots','subsystems','modules','assets','asset_files','events'] loop
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.is_lead())', t || '_delete', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage: private exports bucket, 50 MB per file
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('exports', 'exports', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;

drop policy if exists exports_read on storage.objects;
create policy exports_read on storage.objects for select to authenticated
  using (bucket_id = 'exports' and public.is_member());
drop policy if exists exports_upload on storage.objects;
create policy exports_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'exports' and public.is_member());
drop policy if exists exports_delete on storage.objects;
create policy exports_delete on storage.objects for delete to authenticated
  using (bucket_id = 'exports' and public.is_lead());
