-- Robocon Hub — propose changes from the terminal, leads approve in the hub.
-- Run after 0002 (Supabase → SQL Editor). Safe to re-run.
--
--   member: ./hub.sh propose "…"  →  hub opens a pull request as the club  →  lead approves & merges
-- Writes to these tables come from the hub's server (service role) after it has checked who is asking.

-- Terminal keys: what ./hub.sh uses to say who is proposing. Only a hash is stored.
create table if not exists public.cli_keys (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references public.members (id) on delete cascade,
  key_hash     text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

-- Where each member's copy of a season repo lives, so "Open my copy" reopens it instead of cloning again.
create table if not exists public.workspaces (
  member_id  uuid not null references public.members (id) on delete cascade,
  repo       text not null,
  hostname   text not null,
  path       text not null,
  updated_at timestamptz not null default now(),
  primary key (member_id, repo, hostname)
);

-- The module a member last opened from the hub; ./hub.sh start uses it to put them on the right branch.
alter table public.members add column if not exists focus_module_id uuid references public.modules (id) on delete set null;

-- One row per pull request the hub opened.
create table if not exists public.proposals (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid references public.seasons (id) on delete cascade,
  repo        text not null,
  pr_number   int not null,
  pr_url      text not null,
  branch      text not null,
  title       text not null,
  notes       text,
  author_id   uuid references public.members (id) on delete set null,
  module_ids  uuid[] not null default '{}',
  files       int not null default 0,
  additions   int not null default 0,
  deletions   int not null default 0,
  status      text not null default 'open' check (status in ('open', 'changes_requested', 'merged', 'closed')),
  reviewer_id uuid references public.members (id) on delete set null,
  review_note text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (repo, pr_number)
);
create index if not exists proposals_open_idx on public.proposals (status, updated_at desc);
create index if not exists proposals_branch_idx on public.proposals (repo, branch);

alter table public.cli_keys   enable row level security;
alter table public.workspaces enable row level security;
alter table public.proposals  enable row level security;

drop policy if exists cli_keys_select_own on public.cli_keys;
create policy cli_keys_select_own on public.cli_keys for select to authenticated using (member_id = auth.uid());
drop policy if exists cli_keys_delete_own on public.cli_keys;
create policy cli_keys_delete_own on public.cli_keys for delete to authenticated using (member_id = auth.uid() or public.is_lead());

drop policy if exists workspaces_select_own on public.workspaces;
create policy workspaces_select_own on public.workspaces for select to authenticated using (member_id = auth.uid());
drop policy if exists workspaces_delete_own on public.workspaces;
create policy workspaces_delete_own on public.workspaces for delete to authenticated using (member_id = auth.uid());

drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select to authenticated using (public.is_member());
