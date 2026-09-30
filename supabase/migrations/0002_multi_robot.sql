-- Robocon Hub — several robots per season, plus an R&D bench.
-- Run after 0001_init.sql (Supabase → SQL Editor). Safe to re-run; existing data is kept.
--
--   Season 2026 (RC26) ─┬─ R1  competition robot   → names RC26-R1-GRP-CLAW-v2
--                       ├─ R2  competition robot   → names RC26-R2-DRV-BASE-v1
--                       └─ RD  R&D bench           → names RC26-RD-DRV-SWERVE-v1
-- Existing robots become R1.

-- ─── robots: code + kind, many per season ───────────────────────────────────
alter table public.robots add column if not exists code text;
update public.robots set code = 'R1' where code is null;
alter table public.robots alter column code set not null;

do $$
declare c text;
begin
  -- drop the old one-robot-per-season rule
  for c in
    select con.conname from pg_constraint con
    where con.conrelid = 'public.robots'::regclass and con.contype = 'u'
      and con.conkey = array[(select attnum from pg_attribute where attrelid = 'public.robots'::regclass and attname = 'season_id')]
  loop
    execute format('alter table public.robots drop constraint %I', c);
  end loop;

  if not exists (select 1 from pg_constraint where conname = 'robots_code_check') then
    alter table public.robots add constraint robots_code_check check (code ~ '^(R[1-9]|RD)$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'robots_season_code_key') then
    alter table public.robots add constraint robots_season_code_key unique (season_id, code);
  end if;
end $$;

-- R&D is whatever sits on the RD bench; derived so it can never disagree with the code.
alter table public.robots add column if not exists kind text
  generated always as (case when code = 'RD' then 'rnd' else 'competition' end) stored;

-- ─── asset health: names now carry the robot code ───────────────────────────
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
  exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'step') as has_step,
  exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'pdf')  as has_pdf,
  (a.name ~ '^RC[0-9]{2}-(R[1-9]|RD)-[A-Z]{3}-[A-Z0-9]{2,14}(-[A-Z])?-v[0-9]+$'
     and a.name like s.prefix || '-' || r.code || '-' || sub.code || '-%') as name_ok,
  (a.discipline = 'mech' and a.location = 'drive'
     and not (exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'step')
          and exists (select 1 from public.asset_files f where f.asset_id = a.id and f.kind = 'pdf'))) as missing_exports
from public.assets a
join public.modules m      on m.id = a.module_id
join public.subsystems sub on sub.id = m.subsystem_id
join public.robots r       on r.id = sub.robot_id
join public.seasons s      on s.id = r.season_id;

-- ─── start_season: several robots in one go ─────────────────────────────────
drop function if exists public.start_season(int, text, text, text[], uuid[], text);

-- p_robots: [{"code":"R1","codename":"KANCIL","description":"…"}, {"code":"RD","codename":"R&D"}]
-- p_codes:  subsystems created on every robot. p_carry: proven modules copied into R1.
create or replace function public.start_season(
  p_year int,
  p_robots jsonb,
  p_codes text[] default '{}',
  p_carry uuid[] default '{}',
  p_repo text default null
) returns uuid language plpgsql security invoker set search_path = public as $$
declare
  v_season uuid;
  v_robot  record;
  v_first  uuid;
  v_code   text;
  v_src    record;
  v_sub    uuid;
begin
  if not public.is_lead() then
    raise exception 'Only leads can start a season';
  end if;
  if jsonb_array_length(coalesce(p_robots, '[]')) = 0 then
    raise exception 'A season needs at least one robot';
  end if;

  update public.seasons set is_active = false where is_active;
  insert into public.seasons (year, is_active, repo) values (p_year, true, p_repo) returning id into v_season;

  for v_robot in select * from jsonb_to_recordset(p_robots) as x(code text, codename text, description text) loop
    insert into public.robots (season_id, code, codename, description)
    values (v_season, upper(v_robot.code), upper(trim(v_robot.codename)), v_robot.description)
    returning id into v_sub;
    if v_first is null and upper(v_robot.code) <> 'RD' then v_first := v_sub; end if;
    foreach v_code in array coalesce(p_codes, '{}') loop
      insert into public.subsystems (robot_id, code) values (v_sub, v_code) on conflict do nothing;
    end loop;
  end loop;
  v_first := coalesce(v_first, v_sub);

  for v_src in
    select m.*, sub.code from public.modules m join public.subsystems sub on sub.id = m.subsystem_id
    where m.id = any (coalesce(p_carry, '{}'))
  loop
    insert into public.subsystems (robot_id, code) values (v_first, v_src.code) on conflict do nothing;
    select id into v_sub from public.subsystems where robot_id = v_first and code = v_src.code;
    insert into public.modules (subsystem_id, name, slug, description, lanes, parts_yml, carried_from, status)
    values (v_sub, v_src.name, v_src.slug, v_src.description, v_src.lanes, v_src.parts_yml, v_src.id, 'design');
  end loop;

  return v_season;
end $$;
