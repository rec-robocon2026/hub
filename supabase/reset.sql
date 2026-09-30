-- Robocon Hub — RESET. Deletes every table, view, function and type in the public schema,
-- plus the hub's auth trigger and storage policies. ALL HUB DATA IS LOST.
-- Signed-in accounts (auth.users) are kept, so nobody has to re-register.
--
-- Run in Supabase → SQL Editor, then run migrations/0001_init.sql again for a clean start.
-- The exports bucket itself must be emptied/deleted from Dashboard → Storage (Supabase
-- blocks deleting storage files from SQL).

-- The sign-up trigger lives on auth.users, outside public.
drop trigger if exists on_auth_user_created on auth.users;

-- Storage policies for the exports bucket.
drop policy if exists exports_read   on storage.objects;
drop policy if exists exports_upload on storage.objects;
drop policy if exists exports_delete on storage.objects;

-- Everything in public: views, tables, functions, types (including anything added by hand).
do $$
declare
  r record;
begin
  for r in select table_name from information_schema.views where table_schema = 'public' loop
    execute format('drop view if exists public.%I cascade', r.table_name);
  end loop;

  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('drop table if exists public.%I cascade', r.tablename);
  end loop;

  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
    where n.nspname = 'public' and d.objid is null   -- skip functions owned by extensions
  loop
    execute format('drop function if exists %s cascade', r.sig);
  end loop;

  for r in
    select t.typname
    from pg_type t join pg_namespace n on n.oid = t.typnamespace
    left join pg_depend d on d.objid = t.oid and d.deptype = 'e'
    where n.nspname = 'public' and t.typtype = 'e' and d.objid is null
  loop
    execute format('drop type if exists public.%I cascade', r.typname);
  end loop;
end $$;
