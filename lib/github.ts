import type { Lane } from "@/lib/types";

/** R1/<slug>/<folder>/… (in the season repo, e.g. rec-robocon2026/RC26) → robot, module and lane of a changed file. */
export function classifyPath(path: string): { robot: string; slug: string; lane: Lane | null } | null {
  const m = /^(R[1-9]|RD)\/([a-z0-9-]+)\/(?:([^/]+)\/)?(.*)$/i.exec(path);
  if (!m) return null;
  const [, robotDir, slug, folder = "", rest] = m;
  const robot = robotDir.toUpperCase();
  const file = (rest || "").toLowerCase();
  switch (folder) {
    case "hardware":
      return { robot, slug, lane: /\.kicad_pcb$|gerber|\.zip$|bom/.test(file) ? "PCB" : "SCH" };
    case "firmware":
      return { robot, slug, lane: "FW" };
    case "mech":
      return { robot, slug, lane: "MECH" };
    case "sim":
      return { robot, slug, lane: "SIM" };
    default:
      return { robot, slug, lane: null };
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
  const byModule = new Map<string, { robot: string; slug: string; lanes: Map<Lane | null, number>; files: number }>();
  for (const f of files) {
    const c = classifyPath(f);
    if (!c) continue;
    const key = `${c.robot}/${c.slug}`;
    const entry = byModule.get(key) ?? { robot: c.robot, slug: c.slug, lanes: new Map(), files: 0 };
    entry.lanes.set(c.lane, (entry.lanes.get(c.lane) ?? 0) + 1);
    entry.files++;
    byModule.set(key, entry);
  }
  return [...byModule.values()].map(({ robot, slug, lanes, files }) => ({
    robot,
    slug,
    files,
    lane: [...lanes].filter(([l]) => l).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
  }));
}
