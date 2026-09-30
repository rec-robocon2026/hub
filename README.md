# REC Robocon Hub

A living index of the club's robot, one season at a time: what exists, where it's stored, and what state it's in — so the knowledge stays when members graduate. It records design files; it doesn't store the native CAD itself.

**Structure:** season → robot → subsystems → modules → assets. Each module has five lanes (SCH / PCB / FW / MECH / SIM). STEP/PDF exports live in a private Supabase bucket (50 MB per file).

**Access:** Google sign-in only. New users arrive *pending*; a lead approves them as *member* or *lead*. Members read and add; leads also approve, delete and mark as-built. All of this is enforced in the database (RLS + triggers), not just the UI.

## Stack

- Next.js 16 (App Router, Server Actions, `proxy.ts`) on Vercel
- Supabase: Postgres + Auth (Google) + Storage
- Styling: the Industry design system in `app/industry.css`

## Setting it up (once)

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor → New query** → paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**.
   It creates the tables, RLS, `is_lead()`, the sign-up trigger and the `exports` bucket, and seeds the eight subsystem codes. It is safe to re-run.
3. The first lead is bootstrapped from the `bootstrap_leads` table (seeded with `23005199@siswa.um.edu.my`). That account becomes a lead the first time it signs in. Add more emails there only if you need to recover access.

### 2. Google sign-in

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials): **Create credentials → OAuth client ID → Web application**.
   - Authorized redirect URI: `https://<your-project-ref>.supabase.co/auth/v1/callback` (copy it from Supabase → Authentication → Sign In / Providers → Google).
   - If asked, configure the consent screen first (External, app name "REC Robocon Hub").
2. Supabase → **Authentication → Sign In / Providers → Google** → enable, paste the Client ID and Client secret → Save.
3. Supabase → **Authentication → URL Configuration**:
   - Site URL: `https://hub-wus5.vercel.app` (or your production URL)
   - Redirect URLs: add `http://localhost:3000/**` and `https://hub-wus5.vercel.app/**`

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in from Supabase → **Project Settings → API Keys**:

| Variable | Where it's used |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | everywhere |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | everywhere (the legacy `anon` key also works) |
| `SUPABASE_SECRET_KEY` | only the GitHub webhook — server-side, never exposed |
| `GITHUB_WEBHOOK_SECRET` | only the GitHub webhook |

Add the same four in **Vercel → Project → Settings → Environment Variables**, then **redeploy**. The `NEXT_PUBLIC_` values are baked in at build time.

### 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with Google.

### 5. GitHub pushes (per season repo)

In the season repo on GitHub: **Settings → Webhooks → Add webhook**

- Payload URL: `https://hub-wus5.vercel.app/api/github/webhook`
- Content type: `application/json`
- Secret: the `GITHUB_WEBHOOK_SECRET` value
- Events: just the push event

Then set the repo on the season page (`owner/name`). Pushes that touch `modules/<module>/…` show up in that module's history: `hardware/` → SCH/PCB, `firmware/` → FW, `mech/` → MECH, `sim/` → SIM.

Protect `main` under **Settings → Branches**: require a pull request with one approval. That makes a lead's review the only way into `main`.

## Using it — the order things get added

The site launches empty. Each form depends on the one before it:

1. **Season** (a lead): `/season/new`. Sets the year, robot codename, subsystems and repo, and can carry proven modules forward.
2. **Subsystem leads** (a lead): on the season page.
3. **Drives** (a lead): record DRIVE-A and DRIVE-B, each with a custodian, on `/mechanical#drives`.
4. **Modules** (anyone approved): `/modules/new`.
5. **Items** (anyone approved): the Add form on Programming, Electronics or Mechanical.
   - Mechanical works in three steps: register the master → upload the STEP + PDF on the item page → a lead marks it as-built.

Flags appear wherever the data is shown: names that break `RC26-DRV-PART-v1`, drive masters missing their STEP or PDF, empty lanes, modules untouched for 30+ days, and subsystems without a lead.

## Layout

```
app/(hub)/          signed-in pages (Home, Season, Modules, departments, Members, Quick start, Search)
app/(hub)/actions.ts  every mutation (server actions)
app/login, pending, auth/   sign-in flow
app/api/github/webhook/     push → history
app/files/[id]/     signed download of a private export
lib/                data loading, flags, naming rule, Supabase clients
proxy.ts            session refresh + redirect to /login
supabase/migrations/  the whole database
```
