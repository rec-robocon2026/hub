# REC Robocon Hub

A living index of the club's robot, one season at a time: what exists, where it's stored, and what state it's in — so the knowledge stays when members graduate. It records design files; it doesn't store the native CAD itself.

**Structure:** season → robots → subsystems → modules → assets. Each season has competition robots (R1, R2 …) and an R&D bench (RD). Each module has five lanes (SCH / PCB / FW / MECH / SIM). STEP/PDF exports live in a private Supabase bucket (50 MB per file).

```
Season 2026 (RC26)        GitHub: rec-robocon2026/RC26
├── R1 KANCIL             ├── R1/grp-03/{hardware,firmware,mech,sim}/
├── R2 TAPIR              ├── R2/…
└── RD R&D bench          └── RD/…
Module:  RC26-R1-GRP-03            season · robot · subsystem · number
Version: RC26-R1-GRP-03-v2         one mechanism per version (v1 servo claw, v2 suction cup …)
Item:    RC26-R1-GRP-03-v2-ASM     by kind; a second one is …-ASM2
```

**Names are generated, never typed.** People write a description ("Grabs the rice sack"), and the database applies the rule. When the mechanism changes, start a new version on the module page. It becomes current, new items are named under it, and older versions keep their items, reasons and outcomes as history.

**Access:** Google sign-in only. New users arrive *pending*; a lead approves them as *member* or *lead*. Members read and add; leads also approve, delete and mark as-built. All of this is enforced in the database (RLS + triggers), not just the UI.

## Stack

- Next.js 16 (App Router, Server Actions, `proxy.ts`) on Vercel
- Supabase: Postgres + Auth (Google) + Storage
- Styling: the Industry design system in `app/industry.css`

## Setting it up (once)

### 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL Editor → New query** → paste all of [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) → **Run**, then do the same with [`0002_multi_robot.sql`](supabase/migrations/0002_multi_robot.sql) [`0003_proposals.sql`](supabase/migrations/0003_proposals.sql) and [`0004_naming_versions.sql`](supabase/migrations/0004_naming_versions.sql).
   Together they create the tables, RLS, `is_lead()`, the sign-up trigger and the `exports` bucket, seed the eight subsystem codes, and allow several robots per season. Both are safe to re-run, and 0002 keeps existing data (existing robots become R1).
   To wipe and start over, run [`supabase/reset.sql`](supabase/reset.sql) first.
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
| `GITHUB_TOKEN` | creating season repos and robot/module folders (optional) |
| `GITHUB_ORG`, `GITHUB_REPO_VISIBILITY`, `SITE_URL` | where repos go, private/public, the URL the webhook points to |

Add the same four in **Vercel → Project → Settings → Environment Variables**, then **redeploy**. The `NEXT_PUBLIC_` values are baked in at build time.

### 4. Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000 and sign in with Google.

### 5. GitHub (optional but recommended)

With `GITHUB_TOKEN` set, starting a season creates `rec-robocon2026/RC26` with a folder per robot, installs the push webhook and protects `main`. Each robot or module added later gets its folder committed automatically. For a season created before the token was set, use **Sync to GitHub** on the season page.

Create the token at GitHub → Settings → Developer settings → **Fine-grained tokens** → Generate:
- Resource owner: **rec-robocon2026** (an org owner may need to approve it)
- Repository access: **All repositories**
- Permissions → Repository: **Administration**, **Contents**, **Pull requests**, **Webhooks** → Read and write

Pushes touching `R1/<module>/…` then show up in that module's history: `hardware/` → SCH/PCB, `firmware/` → FW, `mech/` → MECH, `sim/` → SIM.

Protecting `main` on a **private** repo needs a paid GitHub plan (GitHub Team, which is free for schools through GitHub Education). Otherwise make the season repos public with `GITHUB_REPO_VISIBILITY=public`. The hub reports if protection couldn't be set.

### 6. Code changes go through the hub

Members never push. They have **Read** access on GitHub; the hub opens a pull request for them and a lead approves it.
This works on the free plan, because members can't push.

GitHub setup (org owner, once):
- Org → Settings → Member privileges → **Base permissions: No permission**
- Org → Teams: `leads` → **Maintain** on season repos; `members` → **Read**

Member flow:
1. Hub → Members → **Your terminal key** → Create (once per person).
2. Hub → a module → **Open in VS Code**. The first time it clones (save it in Documents); after that, **Open my copy** reopens the same folder.
3. VS Code runs `./hub.sh start` on open (allow automatic tasks once). It fetches the latest version and puts you on the right branch.
4. Edit files in the module's folder, then run `./hub.sh propose "what you did"` in the terminal. Running it again adds to the same request.

Lead flow: Home → *changes waiting for review* → **View changes** → **Approve & merge**, **Request changes** or **Close**. Merging on GitHub works too; the hub picks it up from the webhook.

`hub.sh`, `.vscode/` and `.gitattributes` are managed by the hub and rewritten on every **Sync to GitHub**.

## Using it — the order things get added

The site launches empty. Each form depends on the one before it:

1. **Season** (a lead): `/season/new`. Sets the year, the robots (R1, R2 …) and the R&D bench, the subsystems, and the repo (created for you if GitHub is connected). It can carry proven modules forward.
2. **Subsystem leads** (a lead): on the season page.
3. **Drives** (a lead): record DRIVE-A and DRIVE-B, each with a custodian, on `/mechanical#drives`.
4. **Modules** (anyone approved): `/modules/new`.
5. **Items** (anyone approved): the Add form on Programming, Electronics or Mechanical.
   - Mechanical works in three steps: register the master → upload the STEP + PDF on the item page → a lead marks it as-built.

Flags appear wherever the data is shown: drive masters missing their STEP or PDF, empty lanes, modules untouched for 30+ days, and subsystems without a lead.

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
