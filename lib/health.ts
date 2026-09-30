import type { SeasonBundle } from "@/lib/data";
import { daysSince, shortDate } from "@/lib/format";
import type { AssetHealth, Drive, HubEvent, Lane, Module } from "@/lib/types";
import { LANES } from "@/lib/types";

export const STALE_DAYS = 30;

export type Gap = { text: string; detail?: string; href?: string };

/** Everything missing or stale in a season, most urgent first. */
export function seasonGaps(
  bundle: SeasonBundle,
  events: HubEvent[],
  drives: Drive[],
  pendingMembers: number,
): Gap[] {
  const gaps: Gap[] = [];
  const { assets, modules, subsystems } = bundle;

  const builtNoExports = assets.filter((a) => a.status === "as_built" && a.missing_exports);
  if (builtNoExports.length)
    gaps.push({
      text: `${builtNoExports.length} as-built ${plural(builtNoExports.length, "part has", "parts have")} no STEP + PDF`,
      detail: countBy(builtNoExports, (a) => a.subsystem_code),
      href: "/mechanical#parts",
    });

  const missing = assets.filter((a) => a.status !== "as_built" && a.status !== "retired" && a.missing_exports);
  if (missing.length)
    gaps.push({
      text: `${missing.length} CAD ${plural(missing.length, "master is", "masters are")} missing exports`,
      detail: countBy(missing, (a) => a.subsystem_code),
      href: "/mechanical#parts",
    });

  const messy = assets.filter((a) => !a.name_ok);
  if (messy.length)
    gaps.push({
      text: `${messy.length} ${plural(messy.length, "item doesn't", "items don't")} follow the naming rule`,
      detail: messy.slice(0, 3).map((a) => a.name).join(" · ") + (messy.length > 3 ? " …" : ""),
      href: `/assets/${messy[0].id}`,
    });

  const withAssets = new Set(assets.map((a) => a.module_id));
  const empty = modules.filter((m) => !withAssets.has(m.id) && !events.some((e) => e.module_id === m.id && e.source === "github"));
  if (empty.length)
    gaps.push({
      text: `${empty.length} ${plural(empty.length, "module has", "modules have")} nothing recorded yet`,
      detail: empty.slice(0, 4).map((m) => m.name).join(" · "),
      href: `/modules/${empty[0].id}`,
    });

  const stale = modules.filter((m) => isStale(m, assets, events));
  if (stale.length)
    gaps.push({
      text: `${stale.length} ${plural(stale.length, "module", "modules")} untouched for ${STALE_DAYS}+ days`,
      detail: stale.slice(0, 4).map((m) => m.name).join(" · "),
      href: `/modules/${stale[0].id}`,
    });

  const noLead = subsystems.filter((s) => !s.lead_id);
  if (noLead.length)
    gaps.push({
      text: `${noLead.length} ${plural(noLead.length, "subsystem has", "subsystems have")} no lead`,
      detail: noLead.map((s) => s.code).join(" · "),
      href: `/season/${bundle.season.year}`,
    });

  if (drives.length < 2)
    gaps.push({
      text: drives.length ? "Only one CAD drive recorded" : "No CAD drives recorded",
      detail: "Record DRIVE-A and DRIVE-B with a custodian each",
      href: "/mechanical#drives",
    });
  for (const d of drives) {
    if (!d.custodian_id) gaps.push({ text: `${d.label} has no custodian`, href: "/mechanical#drives" });
    else if (daysSince(d.last_mirrored_at) > STALE_DAYS)
      gaps.push({
        text: `${d.label} not mirrored recently`,
        detail: d.last_mirrored_at ? `last mirrored ${shortDate(d.last_mirrored_at)}` : "never mirrored",
        href: "/mechanical#drives",
      });
  }

  if (!bundle.season.repo)
    gaps.push({ text: "No GitHub repo set for this season", detail: "Pushes can't register until one is", href: `/season/${bundle.season.year}` });

  if (pendingMembers)
    gaps.push({ text: `${pendingMembers} ${plural(pendingMembers, "person is", "people are")} waiting for approval`, href: "/members" });

  return gaps;
}

export function isStale(m: Module, assets: AssetHealth[], events: HubEvent[]) {
  if (m.status === "as_built" || m.status === "retired") return false;
  const last = [m.updated_at, ...assets.filter((a) => a.module_id === m.id).map((a) => a.updated_at), ...events.filter((e) => e.module_id === m.id).map((e) => e.created_at)]
    .sort()
    .at(-1);
  return daysSince(last) > STALE_DAYS;
}

export type LaneState = { code: Lane; label: string; tone: "on" | "empty" | "off" };

/** What each of the five lanes looks like for a module: a revision, a push, empty, or not used. */
export function laneStates(m: Module, assets: AssetHealth[], events: HubEvent[]): LaneState[] {
  return LANES.map((code) => {
    const revs = assets.filter((a) => a.module_id === m.id && a.lane === code && a.revision != null).map((a) => a.revision as number);
    if (revs.length) return { code, label: `v${Math.max(...revs)}`, tone: "on" };
    const any = assets.some((a) => a.module_id === m.id && a.lane === code);
    const push = events.find((e) => e.module_id === m.id && e.lane === code);
    if (any || push) return { code, label: push ? shortDate(push.created_at) : "✓", tone: "on" };
    if (m.lanes.includes(code)) return { code, label: "empty", tone: "empty" };
    return { code, label: "—", tone: "off" };
  });
}

function countBy<T>(items: T[], key: (t: T) => string) {
  const counts = new Map<string, number>();
  items.forEach((i) => counts.set(key(i), (counts.get(key(i)) ?? 0) + 1));
  return [...counts].map(([k, n]) => `${k} ${n}`).join(" · ");
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}
