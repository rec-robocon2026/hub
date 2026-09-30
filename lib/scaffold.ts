import type { Lane } from "@/lib/types";

// What the hub commits into the season repo (rec-robocon2026/RC26) when things are created.

export type RepoFile = { path: string; content: string; executable?: boolean };
export type RobotInfo = { code: string; codename: string; description?: string | null };
export type ModuleInfo = {
  robot: string;
  slug: string;
  name: string;
  subsystem: string;
  lanes: Lane[];
  description?: string | null;
  partsYml?: string | null;
  carriedFrom?: string | null;
};

/** The season repo is named after the prefix: RC26. */
export function seasonRepoName(prefix: string) {
  return prefix;
}

export function seasonFiles(prefix: string, year: number, robots: RobotInfo[], hubUrl?: string): RepoFile[] {
  const list = robots.map((r) => `| \`${r.code}/\` | ${r.code === "RD" ? "R&D bench — experiments and prototypes" : r.codename} |`).join("\n");
  return [
    {
      path: "README.md",
      content: `# ${prefix} — Robocon ${year}

| Folder | Robot |
| --- | --- |
${list}

Each robot folder holds one folder per module: \`R1/<module>/{hardware,firmware,mech,sim}/\`.
Folders are created by the hub${hubUrl ? ` (${hubUrl})` : ""} — declare a module there rather than making folders by hand.

## Rules
- Work on a branch; \`main\` only changes through a pull request a lead approves.
- Name files \`${prefix}-R1-DRV-PART-v1\`: season · robot · subsystem · part · revision.
- Native CAD stays on the club drives. Only STEP/PDF exports and meshes come in here.
`,
    },
    ...robots.map((r) => robotReadme(prefix, r)),
  ];
}

export function robotReadme(prefix: string, r: RobotInfo): RepoFile {
  return {
    path: `${r.code}/README.md`,
    content: `# ${prefix}-${r.code} ${r.code === "RD" ? "R&D bench" : r.codename}

${r.description ?? (r.code === "RD" ? "Experiments and prototypes. Proven work gets socketed onto a competition robot." : "")}

One folder per module. Create modules through the hub so the folder, lanes and history stay in sync.
`,
  };
}

const LANE_FOLDERS: { lane: Lane; folder: string }[] = [
  { lane: "SCH", folder: "hardware" },
  { lane: "PCB", folder: "hardware" },
  { lane: "FW", folder: "firmware" },
  { lane: "MECH", folder: "mech" },
  { lane: "SIM", folder: "sim" },
];

export function moduleFiles(prefix: string, m: ModuleInfo): RepoFile[] {
  const base = `${m.robot}/${m.slug}/`;
  const folders = [...new Set(LANE_FOLDERS.filter((l) => m.lanes.includes(l.lane)).map((l) => l.folder))];
  const files: RepoFile[] = [
    {
      path: `${base}README.md`,
      content: `# ${m.name}

${prefix}-${m.robot}-${m.subsystem} · lanes: ${m.lanes.join(", ") || "none yet"}
${m.carriedFrom ? `\ncarried_from: ${m.carriedFrom}\n` : ""}
${m.description ?? ""}
`,
    },
  ];
  for (const f of folders) {
    if (f === "mech") files.push({ path: `${base}mech/parts.yml`, content: m.partsYml || `# ${base}mech/parts.yml — one entry per part: name, drive path, revision\nparts: []\n` });
    else files.push({ path: `${base}${f}/.gitkeep`, content: "" });
  }
  return files;
}
