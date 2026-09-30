import type { Lane } from "@/lib/types";

/** modules/<slug>/<folder>/… → which module and lane a changed file belongs to. */
export function classifyPath(path: string): { slug: string; lane: Lane | null } | null {
  const m = /^modules\/([a-z0-9-]+)\/(?:([^/]+)\/)?(.*)$/.exec(path);
  if (!m) return null;
  const [, slug, folder = "", rest] = m;
  const file = (rest || "").toLowerCase();
  switch (folder) {
    case "hardware":
      return { slug, lane: /\.kicad_pcb$|gerber|\.zip$|bom/.test(file) ? "PCB" : "SCH" };
    case "firmware":
      return { slug, lane: "FW" };
    case "mech":
      return { slug, lane: "MECH" };
    case "sim":
      return { slug, lane: "SIM" };
    default:
      return { slug, lane: null };
  }
}

export type PushCommit = {
  id: string;
  message: string;
  author?: { name?: string; username?: string };
  added?: string[];
  modified?: string[];
  removed?: string[];
};

/** One history row per (commit, module): the lane touched most, and how many files. */
export function commitTouches(commit: PushCommit) {
  const files = [...(commit.added ?? []), ...(commit.modified ?? []), ...(commit.removed ?? [])];
  const bySlug = new Map<string, { lanes: Map<Lane | null, number>; files: number }>();
  for (const f of files) {
    const c = classifyPath(f);
    if (!c) continue;
    const entry = bySlug.get(c.slug) ?? { lanes: new Map(), files: 0 };
    entry.lanes.set(c.lane, (entry.lanes.get(c.lane) ?? 0) + 1);
    entry.files++;
    bySlug.set(c.slug, entry);
  }
  return [...bySlug].map(([slug, { lanes, files }]) => ({
    slug,
    files,
    lane: [...lanes].filter(([l]) => l).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  }));
}
