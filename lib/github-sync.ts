// Server-only. Keeps the season repo's folders in step with the hub. Never throws: GitHub trouble
// comes back as a note so the hub record is still saved.
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitFiles, ensureRepo, ensureWebhook, githubErrorMessage, githubOrg, isGithubConfigured, protectMain } from "@/lib/github-api";
import { moduleFiles, robotReadme, seasonFiles, seasonRepoName, type RepoFile } from "@/lib/scaffold";
import type { Lane, Module, Robot, Season, Subsystem } from "@/lib/types";

export type SyncResult = { ok: boolean; note: string };

const NOT_CONNECTED: SyncResult = { ok: false, note: "GitHub isn't connected (no GITHUB_TOKEN), so no folders were created." };

function webhookUrl(origin: string | null) {
  const base = process.env.SITE_URL || origin;
  if (!base || /localhost|127\.0\.0\.1/.test(base)) return null; // GitHub can't reach a laptop
  return `${base.replace(/\/$/, "")}/api/github/webhook`;
}

/** Create the season repo if needed, then commit every robot and module folder that's missing. */
export async function syncSeason(supabase: SupabaseClient, seasonId: string, origin: string | null): Promise<SyncResult> {
  if (!isGithubConfigured()) return NOT_CONNECTED;
  try {
    const { data: season } = await supabase.from("seasons").select("*").eq("id", seasonId).single<Season>();
    if (!season) return { ok: false, note: "Season not found." };
    const { data: robots } = await supabase.from("robots").select("*").eq("season_id", seasonId).returns<Robot[]>();
    const robotList = robots ?? [];
    const { data: subs } = await supabase.from("subsystems").select("*").in("robot_id", robotList.map((r) => r.id)).returns<Subsystem[]>();
    const { data: mods } = await supabase.from("modules").select("*").in("subsystem_id", (subs ?? []).map((s) => s.id)).returns<Module[]>();

    let repo = season.repo;
    let created = false;
    if (!repo) {
      const r = await ensureRepo(seasonRepoName(season.prefix), `Robocon ${season.year} — ${robotList.map((x) => `${x.code} ${x.codename}`).join(", ")}`);
      repo = r.repo;
      created = r.created;
      await supabase.from("seasons").update({ repo }).eq("id", season.id);
    }

    const origins = await carriedLabels(supabase, (mods ?? []).map((m) => m.carried_from));
    const files: RepoFile[] = [
      ...seasonFiles(season.prefix, season.year, robotList, process.env.SITE_URL || origin || undefined),
      ...(mods ?? []).map((m) => {
        const sub = subs?.find((s) => s.id === m.subsystem_id);
        const robot = robotList.find((r) => r.id === sub?.robot_id);
        return moduleFiles(season.prefix, moduleInfo(m, robot?.code ?? "R1", sub?.code ?? "", origins.get(m.carried_from ?? "")));
      }).flat(),
    ];
    const { committed } = await commitFiles(repo, files, `hub: scaffold ${season.prefix}`);

    const notes = [created ? `Created ${repo}` : `Using ${repo}`, `${committed} file${committed === 1 ? "" : "s"} committed`];
    const hook = webhookUrl(origin);
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (hook && secret) {
      try {
        const w = await ensureWebhook(repo, hook, secret);
        notes.push(w.created ? "webhook installed" : "webhook already there");
      } catch (e) {
        notes.push(`webhook not installed — ${githubErrorMessage(e)}`);
      }
    }
    try {
      await protectMain(repo);
      notes.push("main protected (1 approval)");
    } catch (e) {
      notes.push(`main not protected — ${githubErrorMessage(e)}. Private repos need a paid GitHub plan for this; public repos don't.`);
    }
    return { ok: true, note: notes.join(" · ") };
  } catch (e) {
    return { ok: false, note: githubErrorMessage(e) };
  }
}

/** Commit one robot's folder. */
export async function syncRobot(supabase: SupabaseClient, robotId: string): Promise<SyncResult> {
  if (!isGithubConfigured()) return NOT_CONNECTED;
  try {
    const { data: robot } = await supabase.from("robots").select("*, seasons(prefix, repo)").eq("id", robotId).single();
    const repo = robot?.seasons?.repo as string | null;
    if (!robot || !repo) return { ok: false, note: "The season has no repo yet — use Sync to GitHub on the season page." };
    await commitFiles(repo, [robotReadme(robot.seasons.prefix, robot)], `hub: add ${robot.code} ${robot.codename}`);
    return { ok: true, note: `${robot.code}/ committed to ${repo}` };
  } catch (e) {
    return { ok: false, note: githubErrorMessage(e) };
  }
}

/** Commit one module's folder: R1/claw/{hardware,firmware,mech,sim}/ */
export async function syncModule(supabase: SupabaseClient, moduleId: string): Promise<SyncResult> {
  if (!isGithubConfigured()) return NOT_CONNECTED;
  try {
    const { data: m } = await supabase
      .from("modules")
      .select("*, subsystems(code, robots(code, seasons(prefix, repo)))")
      .eq("id", moduleId)
      .single();
    const robot = m?.subsystems?.robots;
    const repo = robot?.seasons?.repo as string | null;
    if (!m || !repo) return { ok: false, note: "The season has no repo yet — use Sync to GitHub on the season page." };
    const origins = await carriedLabels(supabase, [m.carried_from]);
    const info = moduleInfo(m as Module, robot.code, m.subsystems.code, origins.get(m.carried_from ?? ""));
    const { committed } = await commitFiles(repo, moduleFiles(robot.seasons.prefix, info), `hub: add module ${robot.code}/${m.slug}`);
    return { ok: true, note: committed ? `${robot.code}/${m.slug}/ committed to ${repo}` : `${robot.code}/${m.slug}/ already in ${repo}` };
  } catch (e) {
    return { ok: false, note: githubErrorMessage(e) };
  }
}

/** carried_from ids → "RC25-R1/claw", for the README lineage line. */
async function carriedLabels(supabase: SupabaseClient, ids: (string | null)[]) {
  const wanted = ids.filter((x): x is string => Boolean(x));
  if (!wanted.length) return new Map<string, string>();
  const { data } = await supabase.from("modules").select("id, slug, subsystems(robots(code, seasons(prefix)))").in("id", wanted);
  type Row = { id: string; slug: string; subsystems: { robots: { code: string; seasons: { prefix: string } } } | null };
  return new Map(((data ?? []) as unknown as Row[]).map((r) => [r.id, `${r.subsystems?.robots?.seasons?.prefix}-${r.subsystems?.robots?.code}/${r.slug}`]));
}

function moduleInfo(m: Module, robot: string, subsystem: string, carriedFrom?: string) {
  return {
    robot,
    slug: m.slug,
    name: m.name,
    subsystem,
    lanes: m.lanes as Lane[],
    description: m.description,
    partsYml: m.parts_yml,
    carriedFrom: carriedFrom ?? null,
  };
}

export { githubOrg, isGithubConfigured };
