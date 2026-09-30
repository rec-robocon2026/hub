import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AssetHealth,
  Drive,
  HubEvent,
  Member,
  Module,
  Robot,
  Season,
  Subsystem,
  SubsystemCode,
} from "@/lib/types";

export type SubsystemRow = Subsystem & { name: string };

export type SeasonBundle = {
  season: Season;
  robot: Robot | null;
  subsystems: SubsystemRow[];
  modules: Module[];
  assets: AssetHealth[];
};

/** A whole season: robot, subsystems, modules and every asset with its health flags. */
export async function loadSeason(supabase: SupabaseClient, year?: number): Promise<SeasonBundle | null> {
  const seasonQuery = supabase.from("seasons").select("*");
  const { data: season } = await (year ? seasonQuery.eq("year", year) : seasonQuery.eq("is_active", true)).maybeSingle();
  if (!season) return null;

  const [{ data: robot }, { data: codes }, { data: assets }] = await Promise.all([
    supabase.from("robots").select("*").eq("season_id", season.id).maybeSingle(),
    supabase.from("subsystem_codes").select("*"),
    supabase.from("asset_health").select("*").eq("season_year", season.year).order("name"),
  ]);

  let subsystems: SubsystemRow[] = [];
  let modules: Module[] = [];
  if (robot) {
    const { data: subs } = await supabase.from("subsystems").select("*").eq("robot_id", robot.id);
    const codeName = new Map((codes as SubsystemCode[] | null)?.map((c) => [c.code, c]) ?? []);
    subsystems = ((subs as Subsystem[] | null) ?? [])
      .map((s) => ({ ...s, name: codeName.get(s.code)?.name ?? s.code }))
      .sort((a, b) => (codeName.get(a.code)?.sort ?? 99) - (codeName.get(b.code)?.sort ?? 99));

    if (subsystems.length) {
      const { data: mods } = await supabase
        .from("modules")
        .select("*")
        .in("subsystem_id", subsystems.map((s) => s.id))
        .order("name");
      modules = (mods as Module[] | null) ?? [];
    }
  }

  return {
    season: season as Season,
    robot: robot as Robot | null,
    subsystems,
    modules,
    assets: (assets as AssetHealth[] | null) ?? [],
  };
}

export async function loadSeasons(supabase: SupabaseClient) {
  const { data } = await supabase.from("seasons").select("*, robots(codename)").order("year", { ascending: false });
  return ((data ?? []) as (Season & { robots: { codename: string } | { codename: string }[] | null })[]).map((s) => ({
    ...s,
    codename: (Array.isArray(s.robots) ? s.robots[0]?.codename : s.robots?.codename) ?? null,
  }));
}

export async function loadMembers(supabase: SupabaseClient) {
  const { data } = await supabase.from("members").select("*").order("full_name");
  return (data as Member[] | null) ?? [];
}

export async function loadCodes(supabase: SupabaseClient) {
  const { data } = await supabase.from("subsystem_codes").select("*").order("sort");
  return (data as SubsystemCode[] | null) ?? [];
}

export async function loadDrives(supabase: SupabaseClient) {
  const { data } = await supabase.from("drives").select("*").order("label");
  return (data as Drive[] | null) ?? [];
}

export async function loadEvents(
  supabase: SupabaseClient,
  opts: { moduleIds?: string[]; sinceDays?: number; limit?: number; source?: "hub" | "github" } = {},
) {
  if (opts.moduleIds && opts.moduleIds.length === 0) return [];
  let q = supabase
    .from("events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 50);
  if (opts.moduleIds) q = q.in("module_id", opts.moduleIds);
  if (opts.sinceDays) q = q.gte("created_at", new Date(Date.now() - opts.sinceDays * 86400000).toISOString());
  if (opts.source) q = q.eq("source", opts.source);
  const { data } = await q;
  return (data as HubEvent[] | null) ?? [];
}

/** Proven modules available to socket into a season, excluding ones already carried into it. */
export async function loadLibrary(supabase: SupabaseClient, bundle: SeasonBundle | null) {
  const { data } = await supabase
    .from("modules")
    .select("*, subsystems(code, robots(seasons(year, prefix)))")
    .eq("is_proven", true)
    .order("name");
  type Row = Module & {
    subsystems: { code: string; robots: { seasons: { year: number; prefix: string } } } | null;
  };
  const carried = new Set(bundle?.modules.map((m) => m.carried_from).filter(Boolean));
  const inSeason = new Set(bundle?.modules.map((m) => m.id));
  return ((data as Row[] | null) ?? [])
    .filter((m) => !carried.has(m.id) && !inSeason.has(m.id))
    .map((m) => ({
      ...m,
      code: m.subsystems?.code ?? "",
      origin: m.subsystems?.robots?.seasons?.prefix ?? "",
    }));
}

/** Follow carried_from back through past seasons: [this, parent, grandparent, …]. */
export async function loadLineage(supabase: SupabaseClient, module: Module) {
  const chain: (Module & { prefix: string })[] = [];
  let next: string | null = module.carried_from;
  while (next && chain.length < 10) {
    const { data } = await supabase
      .from("modules")
      .select("*, subsystems(robots(seasons(prefix)))")
      .eq("id", next)
      .maybeSingle();
    if (!data) break;
    chain.push({ ...(data as Module), prefix: data.subsystems?.robots?.seasons?.prefix ?? "" });
    next = data.carried_from;
  }
  return chain;
}

/** Modules of a season as options for the Add forms, grouped by subsystem order. */
export function moduleOptions(bundle: SeasonBundle | null) {
  if (!bundle) return [];
  const order = new Map(bundle.subsystems.map((s, i) => [s.id, i]));
  const code = new Map(bundle.subsystems.map((s) => [s.id, s.code]));
  return [...bundle.modules]
    .sort((a, b) => (order.get(a.subsystem_id) ?? 0) - (order.get(b.subsystem_id) ?? 0) || a.name.localeCompare(b.name))
    .map((m) => ({ id: m.id, name: m.name, slug: m.slug, code: code.get(m.subsystem_id) ?? "", prefix: bundle.season.prefix }));
}

export function memberMap(members: Member[]) {
  return new Map(members.map((m) => [m.id, m]));
}
