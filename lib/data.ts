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

export type SubsystemRow = Subsystem & { name: string; robotCode: string };

export type SeasonBundle = {
  season: Season;
  /** Competition robots first (R1, R2 …), the R&D bench last. */
  robots: Robot[];
  subsystems: SubsystemRow[];
  modules: Module[];
  assets: AssetHealth[];
};

export function sortRobots<T extends { code: string }>(robots: T[]) {
  return [...robots].sort((a, b) => (a.code === "RD" ? 1 : b.code === "RD" ? -1 : a.code.localeCompare(b.code)));
}

/** "RC26-R1" — the start of every file name on that robot. */
export function robotPrefix(season: Pick<Season, "prefix">, robot: Pick<Robot, "code">) {
  return `${season.prefix}-${robot.code}`;
}

/** Folder of a module in the season repo (rec-robocon2026/RC26): R1/claw/ */
export function moduleFolder(robotCode: string, slug: string) {
  return `${robotCode}/${slug}/`;
}

/** A whole season: robots, subsystems, modules and every asset with its health flags. */
export async function loadSeason(supabase: SupabaseClient, year?: number): Promise<SeasonBundle | null> {
  const seasonQuery = supabase.from("seasons").select("*");
  const { data: season } = await (year ? seasonQuery.eq("year", year) : seasonQuery.eq("is_active", true)).maybeSingle();
  if (!season) return null;

  const [{ data: robotRows }, { data: codes }, { data: assets }] = await Promise.all([
    supabase.from("robots").select("*").eq("season_id", season.id),
    supabase.from("subsystem_codes").select("*"),
    supabase.from("asset_health").select("*").eq("season_year", season.year).order("name"),
  ]);
  const robots = sortRobots((robotRows as Robot[] | null) ?? []);

  let subsystems: SubsystemRow[] = [];
  let modules: Module[] = [];
  if (robots.length) {
    const { data: subs } = await supabase.from("subsystems").select("*").in("robot_id", robots.map((r) => r.id));
    const codeInfo = new Map((codes as SubsystemCode[] | null)?.map((c) => [c.code, c]) ?? []);
    const robotIndex = new Map(robots.map((r, i) => [r.id, i]));
    const robotCode = new Map(robots.map((r) => [r.id, r.code]));
    subsystems = ((subs as Subsystem[] | null) ?? [])
      .map((s) => ({ ...s, name: codeInfo.get(s.code)?.name ?? s.code, robotCode: robotCode.get(s.robot_id) ?? "" }))
      .sort(
        (a, b) =>
          (robotIndex.get(a.robot_id) ?? 0) - (robotIndex.get(b.robot_id) ?? 0) ||
          (codeInfo.get(a.code)?.sort ?? 99) - (codeInfo.get(b.code)?.sort ?? 99),
      );

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
    robots,
    subsystems,
    modules,
    assets: (assets as AssetHealth[] | null) ?? [],
  };
}

/** The robot a module sits on. */
export function robotOfModule(bundle: SeasonBundle, m: Pick<Module, "subsystem_id">) {
  const sub = bundle.subsystems.find((s) => s.id === m.subsystem_id);
  return bundle.robots.find((r) => r.id === sub?.robot_id);
}

export async function loadSeasons(supabase: SupabaseClient) {
  const { data } = await supabase.from("seasons").select("*, robots(code, codename)").order("year", { ascending: false });
  return ((data ?? []) as (Season & { robots: { code: string; codename: string }[] | null })[]).map((s) => ({
    ...s,
    codename:
      sortRobots(s.robots ?? [])
        .filter((r) => r.code !== "RD")
        .map((r) => r.codename)
        .join(" · ") || null,
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

type ModuleWithPlace = Module & {
  subsystems: { code: string; robots: { code: string; seasons: { year: number; prefix: string } } } | null;
};

/**
 * Proven modules that can be socketed into a season: past-season modules, plus this season's
 * R&D bench (so a proven prototype can be promoted onto a competition robot).
 */
export async function loadLibrary(supabase: SupabaseClient, bundle: SeasonBundle | null) {
  const { data } = await supabase
    .from("modules")
    .select("*, subsystems(code, robots(code, seasons(year, prefix)))")
    .eq("is_proven", true)
    .order("name");
  const carried = new Set(bundle?.modules.map((m) => m.carried_from).filter(Boolean));
  const inSeason = new Set(bundle?.modules.map((m) => m.id));
  return ((data as ModuleWithPlace[] | null) ?? [])
    .filter((m) => !carried.has(m.id) && (!inSeason.has(m.id) || m.subsystems?.robots?.code === "RD"))
    .map((m) => ({
      ...m,
      code: m.subsystems?.code ?? "",
      origin: `${m.subsystems?.robots?.seasons?.prefix ?? ""}-${m.subsystems?.robots?.code ?? ""}`,
    }));
}

/** Follow carried_from back through past seasons: [parent, grandparent, …]. */
export async function loadLineage(supabase: SupabaseClient, module: Module) {
  const chain: (Module & { prefix: string })[] = [];
  let next: string | null = module.carried_from;
  while (next && chain.length < 10) {
    const { data } = await supabase
      .from("modules")
      .select("*, subsystems(robots(code, seasons(prefix)))")
      .eq("id", next)
      .maybeSingle();
    if (!data) break;
    const robot = data.subsystems?.robots;
    chain.push({ ...(data as Module), prefix: `${robot?.seasons?.prefix ?? ""}-${robot?.code ?? ""}` });
    next = data.carried_from;
  }
  return chain;
}

/** Modules of a season as options for the Add forms, in robot → subsystem order. */
export function moduleOptions(bundle: SeasonBundle | null) {
  if (!bundle) return [];
  const order = new Map(bundle.subsystems.map((s, i) => [s.id, i]));
  const sub = new Map(bundle.subsystems.map((s) => [s.id, s]));
  return [...bundle.modules]
    .sort((a, b) => (order.get(a.subsystem_id) ?? 0) - (order.get(b.subsystem_id) ?? 0) || a.name.localeCompare(b.name))
    .map((m) => {
      const s = sub.get(m.subsystem_id);
      return {
        id: m.id,
        name: m.name,
        slug: m.slug,
        code: s?.code ?? "",
        robot: s?.robotCode ?? "",
        prefix: `${bundle.season.prefix}-${s?.robotCode ?? ""}`,
      };
    });
}

export function memberMap(members: Member[]) {
  return new Map(members.map((m) => [m.id, m]));
}
