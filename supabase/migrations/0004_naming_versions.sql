-- Robocon Hub — the hub names everything; people only describe.
-- Run after 0003_proposals.sql. Safe to run twice.
--
--   Module   RC26-R1-GRP-03             season · robot · subsystem · number (next free in that subsystem)
--   Version  RC26-R1-GRP-03-v2          each version is one mechanism: v1 servo claw, v2 suction cup …
--   Item     RC26-R1-GRP-03-v2-ASM      the file/record, by kind (ASM, PART, SCH, PCB, FW, LOG …); ASM2 for a second one
--
-- Existing modules and items are renamed to the rule; their old names are kept in the description / title.

-- ─── Modules: a number, and which version is current ────────────────────────
alter table public.modules add column if not exists number int;
alter table public.modules add column if not exists current_version int not null default 1;

with n as (
  select id, row_number() over (partition by subsystem_id order by created_at, id) as rn
  from public.modules where number is null
)
update public.modules m set number = n.rn from n where n.id = m.id;

update public.modules m
set description = case when coalesce(trim(m.description), '') = '' then m.name else m.name || ' — ' || m.description end,
    name = s.prefix || '-' || r.code || '-' || sub.code || '-' || lpad(m.number::text, 2, '0')
from public.subsystems sub
join public.robots r  on r.id = sub.robot_id
join public.seasons s on s.id = r.season_id
where sub.id = m.subsystem_id
  and m.name !~ '^RC[0-9]{2}-(R[1-9]|RD)-[A-Z]{3}-[0-9]{2,}$';

alter table public.modules alter column number set not null;
create unique index if not exists modules_number_uq on public.modules (subsystem_id, number);

-- ─── Versions: one row per mechanism tried ──────────────────────────────────
create table if not exists public.module_versions (
  id         uuid primary key default gen_random_uuid(),
  module_id  uuid not null references public.modules (id) on delete cascade,
  number     int not null check (number > 0),
  mechanism  text not null check (length(trim(mechanism)) > 0),  -- 'Two-finger claw on an MG996R servo'
  why        text,                                               -- what changed from the one before, and why
  outcome    text,                                               -- how it went: 'Dropped sacks above 1 kg'
  created_by uuid default auth.uid() references public.members (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (module_id, number)
);

insert into public.module_versions (module_id, number, mechanism, created_by)
select m.id, 1, 'First version', m.created_by
from public.modules m
where not exists (select 1 from public.module_versions v where v.module_id = m.id);

alter table public.module_versions enable row level security;
drop policy if exists module_versions_select on public.module_versions;
create policy module_versions_select on public.module_versions for select to authenticated using (public.is_member());
drop policy if exists module_versions_insert on public.module_versions;
create policy module_versions_insert on public.module_versions for insert to authenticated with check (public.is_member());
drop policy if exists module_versions_update on public.module_versions;
create policy module_versions_update on public.module_versions for update to authenticated using (public.is_member()) with check (public.is_member());
drop policy if exists module_versions_delete on public.module_versions;
create policy module_versions_delete on public.module_versions for delete to authenticated using (public.is_lead());

-- ─── Items: belong to a version, named by kind ──────────────────────────────
alter table public.assets add column if not exists version_id uuid references public.module_versions (id) on delete cascade;

update public.assets a set version_id = v.id
from public.module_versions v
where a.version_id is null and v.module_id = a.module_id and v.number = 1;

create or replace function public.kind_code(p_kind text)
returns text language sql immutable as $$
  select case lower(trim(p_kind))
    when 'firmware'                then 'FW'
    when 'test log'                then 'LOG'
    when 'calibration data'        then 'CAL'
    when 'tuning note'             then 'TUNE'
    when 'simulation asset'        then 'SIM'
    when 'helper script'           then 'TOOL'
    when 'schematic'               then 'SCH'
    when 'pcb layout'              then 'PCB'
    when 'gerber release'          then 'GBR'
    when 'bom'                     then 'BOM'
    when 'wiring diagram'          then 'WIRE'
    when 'datasheet'               then 'DS'
    when 'cad part'                then 'PART'
    when 'cad assembly'            then 'ASM'
    when 'jig or fixture'          then 'JIG'
    when 'photo of the built part' then 'PHOTO'
    when 'simulation mesh'         then 'MESH'
    else coalesce(nullif(left(regexp_replace(upper(coalesce(p_kind, '')), '[^A-Z]', '', 'g'), 4), ''), 'ITEM')
  end
$$;

-- Next free item name in a version: RC26-R1-GRP-03-v2-ASM, then …-ASM2, …-ASM3.
create or replace function public.asset_name(p_version uuid, p_kind text, p_self uuid default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_base text;
  v_name text;
  k      int := 1;
begin
  select m.name || '-v' || v.number || '-' || public.kind_code(p_kind) into v_base
  from public.module_versions v join public.modules m on m.id = v.module_id
  where v.id = p_version;
  if v_base is null then raise exception 'Unknown module version'; end if;
  v_name := v_base;
  while exists (select 1 from public.assets where name = v_name and id is distinct from p_self) loop
    k := k + 1;
    v_name := v_base || k;
  end loop;
  return v_name;
end $$;

-- Rename existing items to the rule; the old name moves into the title if there was none.
with x as (
  select a.id, a.name as old,
         m.name || '-v1-' || public.kind_code(a.kind) as base,
         row_number() over (partition by a.module_id, public.kind_code(a.kind) order by a.created_at, a.id) as rn
  from public.assets a join public.modules m on m.id = a.module_id
  where a.name !~ '^RC[0-9]{2}-(R[1-9]|RD)-[A-Z]{3}-[0-9]{2,}-v[0-9]+-[A-Z]{2,6}[0-9]*$'
)
update public.assets a
set title = coalesce(nullif(trim(a.title), ''), x.old),
    name = x.base || case when x.rn > 1 then x.rn::text else '' end,
    revision = 1
from x where x.id = a.id;

create unique index if not exists assets_name_uq on public.assets (name);

-- ─── The rule, enforced in the database (the app cannot type a name) ─────────
create or replace function public.modules_apply_code()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_prefix text;
  v_robot  text;
  v_code   text;
  v_no     int;
begin
  if tg_op = 'UPDATE' then
    new.number := old.number;
    new.name := old.name;
    new.slug := old.slug;
    new.subsystem_id := old.subsystem_id;
    if new.current_version is distinct from old.current_version
       and not exists (select 1 from public.module_versions where module_id = new.id and number = new.current_version) then
      raise exception 'Version v% does not exist', new.current_version;
    end if;
    return new;
  end if;

  select s.prefix, r.code, sub.code into v_prefix, v_robot, v_code
  from public.subsystems sub join public.robots r on r.id = sub.robot_id join public.seasons s on s.id = r.season_id
  where sub.id = new.subsystem_id;
  if v_code is null then raise exception 'Unknown subsystem'; end if;

  select coalesce(max(number), 0) + 1 into v_no from public.modules where subsystem_id = new.subsystem_id;
  while exists (select 1 from public.modules where subsystem_id = new.subsystem_id
                and slug = lower(v_code) || '-' || lpad(v_no::text, 2, '0')) loop
    v_no := v_no + 1;
  end loop;

  new.number := v_no;
  new.name := v_prefix || '-' || v_robot || '-' || v_code || '-' || lpad(v_no::text, 2, '0');
  new.slug := lower(v_code) || '-' || lpad(v_no::text, 2, '0');
  new.current_version := 1;
  return new;
end $$;

drop trigger if exists modules_apply_code on public.modules;
create trigger modules_apply_code before insert or update on public.modules
  for each row execute function public.modules_apply_code();

-- Every module starts with v1. A carried module starts from the mechanism it was carried with.
create or replace function public.modules_first_version()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_src  text;
  v_mech text;
begin
  if new.carried_from is not null then
    select m.name || '-v' || v.number, v.mechanism into v_src, v_mech
    from public.modules m join public.module_versions v on v.module_id = m.id and v.number = m.current_version
    where m.id = new.carried_from;
  end if;
  insert into public.module_versions (module_id, number, mechanism, why)
  values (new.id, 1, coalesce(v_mech, 'First version'), case when v_src is not null then 'Carried from ' || v_src end);
  return new;
end $$;

drop trigger if exists modules_first_version on public.modules;
create trigger modules_first_version after insert on public.modules
  for each row execute function public.modules_first_version();

-- New versions get the next number and become current.
create or replace function public.versions_number()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.number := old.number;
    new.module_id := old.module_id;
    return new;
  end if;
  if new.number is null or new.number <> 1 then
    select coalesce(max(number), 0) + 1 into new.number from public.module_versions where module_id = new.module_id;
  end if;
  return new;
end $$;

drop trigger if exists versions_number on public.module_versions;
create trigger versions_number before insert or update on public.module_versions
  for each row execute function public.versions_number();

create or replace function public.versions_started()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.number > 1 then
    perform set_config('hub.version_started', '1', true);
    update public.modules set current_version = new.number where id = new.module_id;
    perform set_config('hub.version_started', '', true);
    insert into public.events (module_id, actor_id, action, detail)
    values (new.module_id, auth.uid(), 'started v' || new.number, new.mechanism);
  end if;
  return new;
end $$;

drop trigger if exists versions_started on public.module_versions;
create trigger versions_started after insert on public.module_versions
  for each row execute function public.versions_started();

create or replace function public.modules_version_switched()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.current_version is distinct from old.current_version
     and coalesce(current_setting('hub.version_started', true), '') = '' then
    insert into public.events (module_id, actor_id, action, detail)
    select new.id, auth.uid(), 'switched to v' || new.current_version, v.mechanism
    from public.module_versions v where v.module_id = new.id and v.number = new.current_version;
  end if;
  return new;
end $$;

drop trigger if exists modules_version_switched on public.modules;
create trigger modules_version_switched after update on public.modules
  for each row execute function public.modules_version_switched();

-- Items: version defaults to the module's current one; the name is always generated.
create or replace function public.assets_apply_name()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.version_id is null then
    select v.id into new.version_id
    from public.modules m join public.module_versions v on v.module_id = m.id and v.number = m.current_version
    where m.id = new.module_id;
  end if;
  if not exists (select 1 from public.module_versions where id = new.version_id and module_id = new.module_id) then
    raise exception 'That version belongs to a different module';
  end if;
  if tg_op = 'INSERT' or new.version_id is distinct from old.version_id
     or new.kind is distinct from old.kind or new.module_id is distinct from old.module_id then
    new.name := public.asset_name(new.version_id, new.kind, new.id);
    select number into new.revision from public.module_versions where id = new.version_id;
  else
    new.name := old.name;
    new.revision := old.revision;
  end if;
  return new;
end $$;

drop trigger if exists assets_apply_name on public.assets;
create trigger assets_apply_name before insert or update on public.assets
  for each row execute function public.assets_apply_name();

-- ─── asset_health: now with the version ─────────────────────────────────────
drop view if exists public.asset_health;
create view public.asset_health with (security_invoker = on) as
select
  a.*,
  s.prefix       as season_prefix,
  s.year         as season_year,
  r.id           as robot_id,
  r.code         as robot_code,
  r.codename     as robot_codename,
  sub.code       as subsystem_code,
  m.name         as module_name,
  m.slug         as module_slug,
  m.description  as module_description,
  m.current_version as module_current_version,
  v.number       as version_number,
  v.mechanism    as version_mechanism,
  exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'step') as has_step,
  exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'pdf')  as has_pdf,
  (a.name ~ '^RC[0-9]{2}-(R[1-9]|RD)-[A-Z]{3}-[0-9]{2,}-v[0-9]+-[A-Z]{2,6}[0-9]*$') as name_ok,
  (a.discipline = 'mech' and a.location = 'drive'
     and not (exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'step')
          and exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'pdf'))) as missing_exports
from public.assets a
join public.modules m          on m.id = a.module_id
left join public.module_versions v on v.id = a.version_id
join public.subsystems sub     on sub.id = m.subsystem_id
join public.robots r           on r.id = sub.robot_id
join public.seasons s          on s.id = r.season_id;
