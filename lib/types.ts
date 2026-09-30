export type Role = "pending" | "member" | "lead" | "alum";
export type Status = "concept" | "design" | "as_built" | "retired";
export type Lane = "SCH" | "PCB" | "FW" | "MECH" | "SIM";
export type Discipline = "mech" | "elec" | "prog";
export type Location = "github" | "drive" | "storage" | "link";

export const LANES: Lane[] = ["SCH", "PCB", "FW", "MECH", "SIM"];
export const STATUSES: Status[] = ["concept", "design", "as_built", "retired"];

export type Member = {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: Role;
  batch: string | null;
  department: Discipline | null;
  approved_at: string | null;
  created_at: string;
  focus_module_id?: string | null;
};

export type SubsystemCode = { code: string; name: string; description: string | null; sort: number };

export type Drive = {
  id: string;
  label: string;
  custodian_id: string | null;
  notes: string | null;
  last_mirrored_at: string | null;
};

export type Season = {
  id: string;
  year: number;
  prefix: string;
  is_active: boolean;
  result: string | null;
  repo: string | null;
  created_at: string;
};

export type Robot = {
  id: string;
  season_id: string;
  code: string; // R1, R2 … or RD for the R&D bench
  kind: "competition" | "rnd";
  codename: string;
  description: string | null;
};

export type Subsystem = {
  id: string;
  robot_id: string;
  code: string;
  lead_id: string | null;
  notes: string | null;
};

export type Module = {
  id: string;
  subsystem_id: string;
  name: string;
  slug: string;
  number: number;
  current_version: number;
  description: string | null;
  status: Status;
  lanes: Lane[];
  parts_yml: string | null;
  carried_from: string | null;
  is_proven: boolean;
  proven_note: string | null;
  created_at: string;
  updated_at: string;
};

/** One mechanism tried for a module: v1 servo claw, v2 suction cup … */
export type ModuleVersion = {
  id: string;
  module_id: string;
  number: number;
  mechanism: string;
  why: string | null;
  outcome: string | null;
  created_by: string | null;
  created_at: string;
};

export type Asset = {
  id: string;
  module_id: string;
  version_id: string | null;
  name: string;
  title: string | null;
  kind: string;
  discipline: Discipline;
  lane: Lane | null;
  location: Location;
  drive_id: string | null;
  path: string | null;
  url: string | null;
  revision: number | null;
  status: Status;
  notes: string | null;
  built_by: string | null;
  built_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

/** Row of the asset_health view: an asset plus its context and flags. */
export type AssetHealth = Asset & {
  season_prefix: string;
  season_year: number;
  robot_id: string;
  robot_code: string;
  robot_codename: string;
  subsystem_code: string;
  module_name: string;
  module_slug: string;
  module_description: string | null;
  module_current_version: number;
  version_number: number | null;
  version_mechanism: string | null;
  has_step: boolean;
  has_pdf: boolean;
  name_ok: boolean;
  missing_exports: boolean;
};

export type AssetFile = {
  id: string;
  asset_id: string;
  kind: "step" | "pdf" | "stl" | "mesh" | "other";
  storage_path: string;
  file_name: string;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export type HubEvent = {
  id: number;
  module_id: string | null;
  asset_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  detail: string | null;
  lane: Lane | null;
  sha: string | null;
  branch: string | null;
  source: "hub" | "github";
  created_at: string;
};

/** Result shape every form action returns. */
export type ActionResult = { ok: boolean; message?: string; id?: string };
