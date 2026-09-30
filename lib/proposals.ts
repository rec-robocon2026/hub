import type { SupabaseClient } from "@supabase/supabase-js";

export type ProposalStatus = "open" | "changes_requested" | "merged" | "closed";

export type Proposal = {
  id: string;
  season_id: string | null;
  repo: string;
  pr_number: number;
  pr_url: string;
  branch: string;
  title: string;
  notes: string | null;
  author_id: string | null;
  module_ids: string[];
  files: number;
  additions: number;
  deletions: number;
  status: ProposalStatus;
  reviewer_id: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
};

export const STATUS_TEXT: Record<ProposalStatus, string> = {
  open: "waiting for a lead",
  changes_requested: "a lead asked for changes",
  merged: "approved and merged",
  closed: "closed without merging",
};

/** Proposals for the review panels, plus "R1/claw" labels for the modules they touch. */
export async function loadProposals(
  supabase: SupabaseClient,
  opts: { live?: boolean; moduleId?: string; limit?: number } = {},
) {
  let q = supabase.from("proposals").select("*").order("updated_at", { ascending: false }).limit(opts.limit ?? 30);
  if (opts.live) q = q.in("status", ["open", "changes_requested"]);
  if (opts.moduleId) q = q.contains("module_ids", [opts.moduleId]);
  const { data } = await q;
  const proposals = (data as Proposal[] | null) ?? [];
  return { proposals, moduleLabel: await moduleLabels(supabase, proposals.flatMap((p) => p.module_ids)) };
}

/** module id → "R1/claw" */
export async function moduleLabels(supabase: SupabaseClient, moduleIds: string[]) {
  const ids = [...new Set(moduleIds)];
  const labels = new Map<string, string>();
  if (!ids.length) return labels;
  const { data } = await supabase.from("modules").select("id, slug, subsystems(robots(code))").in("id", ids);
  type Row = { id: string; slug: string; subsystems: { robots: { code: string } | null } | null };
  for (const m of (data ?? []) as unknown as Row[]) labels.set(m.id, `${m.subsystems?.robots?.code ?? "?"}/${m.slug}`);
  return labels;
}

export type RepoModule ={ id: string; name: string; slug: string; robot: string; subsystem: string };

/** The season behind a repo, and its modules keyed "R1/claw". */
export async function loadRepoContext(admin: SupabaseClient, repo: string) {
  const { data: season } = await admin.from("seasons").select("id, prefix, year, repo").ilike("repo", repo).maybeSingle();
  if (!season) return null;
  const { data: robots } = await admin.from("robots").select("id, code").eq("season_id", season.id);
  const robotCode = new Map((robots ?? []).map((r) => [r.id as string, r.code as string]));
  const { data: subs } = await admin.from("subsystems").select("id, code, robot_id").in("robot_id", [...robotCode.keys()]);
  const subInfo = new Map((subs ?? []).map((s) => [s.id as string, { code: s.code as string, robot: robotCode.get(s.robot_id) ?? "" }]));
  const { data: mods } = await admin.from("modules").select("id, name, slug, subsystem_id").in("subsystem_id", [...subInfo.keys()]);
  const modules = new Map<string, RepoModule>();
  for (const m of mods ?? []) {
    const s = subInfo.get(m.subsystem_id);
    if (s) modules.set(`${s.robot}/${m.slug}`, { id: m.id, name: m.name, slug: m.slug, robot: s.robot, subsystem: s.code });
  }
  return { season: season as { id: string; prefix: string; year: number; repo: string }, modules };
}

export type StartDecision = { switchTo: string | null; say: string[] };

/**
 * Which branch ./hub.sh start should leave the member on:
 * - the request for the module they just opened from the hub, if they have one still open;
 * - otherwise the latest main (their open requests are safe on GitHub meanwhile).
 */
export function decideStart(opts: {
  current: string;
  defaultBranch: string;
  mine: Pick<Proposal, "branch" | "status" | "title" | "review_note" | "module_ids">[];
  focusModuleId: string | null;
}): StartDecision {
  const { current, defaultBranch, mine, focusModuleId } = opts;
  const say: string[] = [];
  const live = mine.filter((p) => p.status === "open" || p.status === "changes_requested");
  const onRequest = mine.find((p) => p.branch === current);

  if (onRequest && (onRequest.status === "merged" || onRequest.status === "closed")) {
    say.push(onRequest.status === "merged" ? `✓ "${onRequest.title}" was approved and merged.` : `"${onRequest.title}" was closed without merging.`);
  }

  const forFocus = focusModuleId ? live.find((p) => p.module_ids.includes(focusModuleId)) : undefined;
  let target: string;
  if (forFocus) target = forFocus.branch;
  else if (onRequest && live.includes(onRequest) && !focusModuleId) target = onRequest.branch;
  else target = defaultBranch;

  const continuing = live.find((p) => p.branch === target);
  if (continuing) {
    say.push(`Continuing your request "${continuing.title}" — ${continuing.status === "changes_requested" ? "a lead asked for changes" : "still waiting for a lead"}.`);
    if (continuing.review_note) say.push(`Lead said: ${continuing.review_note}`);
    say.push(`Edit, then:  ./hub.sh propose "what you changed"  (it updates the same request)`);
  } else {
    say.push(`✓ On the latest ${defaultBranch}.`);
    const others = live.filter((p) => p.branch !== target);
    if (others.length) say.push(`${others.length} of your requests ${others.length === 1 ? "is" : "are"} waiting for review — safe on GitHub, nothing to do.`);
  }
  return { switchTo: target, say };
}

/** "RC26 fix servo limits" → rc26/aiman/fix-servo-limits */
export function proposalBranch(prefix: string, handle: string, title: string) {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40)
    .replace(/-$/, "");
  return `${prefix.toLowerCase()}/${handle}/${slug || "change"}`;
}
