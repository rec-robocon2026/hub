"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireLead, requireMember } from "@/lib/auth";
import { checkName, revisionOf, slugify } from "@/lib/naming";
import type { ActionResult, Discipline, Lane, Location, Role, Status } from "@/lib/types";
import { LANES, STATUSES } from "@/lib/types";

// Every action re-checks the role for a clear message; RLS and the triggers enforce it regardless.

type State = ActionResult | null;

const str = (fd: FormData, key: string) => String(fd.get(key) ?? "").trim();
const opt = (fd: FormData, key: string) => str(fd, key) || null;

function fail(error: PostgrestError | { message: string }): ActionResult {
  const msg = error.message;
  if (/row-level security/i.test(msg)) return { ok: false, message: "You don't have permission to do that." };
  if (/duplicate key/i.test(msg)) return { ok: false, message: "That already exists." };
  return { ok: false, message: msg };
}

function done(message: string, id?: string): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message, id };
}

// ─── Seasons ────────────────────────────────────────────────────────────────

export async function startSeason(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const year = Number(str(fd, "year"));
  const codename = str(fd, "codename");
  if (!year || year < 2000 || year > 2099) return { ok: false, message: "Enter the season year, e.g. 2027." };
  if (!codename) return { ok: false, message: "Give the robot a codename first." };

  const { error } = await supabase.rpc("start_season", {
    p_year: year,
    p_codename: codename,
    p_description: opt(fd, "description"),
    p_codes: fd.getAll("codes").map(String),
    p_carry: fd.getAll("carry").map(String),
    p_repo: opt(fd, "repo"),
  });
  if (error) return fail(error);
  revalidatePath("/", "layout");
  redirect(`/season/${year}`);
}

export async function updateSeason(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const id = str(fd, "season_id");
  const repo = opt(fd, "repo")?.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "") ?? null;
  const { error } = await supabase.from("seasons").update({ repo, result: opt(fd, "result") }).eq("id", id);
  if (error) return fail(error);
  const { error: e2 } = await supabase
    .from("robots")
    .update({ codename: str(fd, "codename").toUpperCase(), description: opt(fd, "description") })
    .eq("season_id", id);
  if (e2) return fail(e2);
  return done("Saved");
}

export async function setActiveSeason(fd: FormData) {
  const { supabase } = await requireLead();
  const id = str(fd, "season_id");
  await supabase.from("seasons").update({ is_active: false }).eq("is_active", true);
  await supabase.from("seasons").update({ is_active: true }).eq("id", id);
  revalidatePath("/", "layout");
}

export async function deleteSeason(fd: FormData) {
  const { supabase } = await requireLead();
  if (str(fd, "confirm") !== "DELETE") return;
  await supabase.from("seasons").delete().eq("id", str(fd, "season_id"));
  revalidatePath("/", "layout");
  redirect("/season");
}

// ─── Subsystems & codes ─────────────────────────────────────────────────────

export async function addSubsystem(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const { error } = await supabase
    .from("subsystems")
    .insert({ robot_id: str(fd, "robot_id"), code: str(fd, "code"), lead_id: opt(fd, "lead_id") });
  if (error) return fail(error);
  return done(`Added ${str(fd, "code")}`);
}

export async function setSubsystemLead(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const { error } = await supabase
    .from("subsystems")
    .update({ lead_id: opt(fd, "lead_id"), notes: opt(fd, "notes") })
    .eq("id", str(fd, "subsystem_id"));
  if (error) return fail(error);
  return done("Saved");
}

export async function deleteSubsystem(fd: FormData) {
  const { supabase } = await requireLead();
  await supabase.from("subsystems").delete().eq("id", str(fd, "subsystem_id"));
  revalidatePath("/", "layout");
  redirect(`/season/${str(fd, "year")}`);
}

export async function addCode(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const code = str(fd, "code").toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return { ok: false, message: "Codes are exactly three letters." };
  const { count } = await supabase.from("subsystem_codes").select("*", { count: "exact", head: true });
  const { error } = await supabase.from("subsystem_codes").insert({ code, name: str(fd, "name"), sort: (count ?? 0) + 1 });
  if (error) return fail(error);
  return done(`${code} added for the whole club`);
}

// ─── Modules ────────────────────────────────────────────────────────────────

export async function createModule(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const name = str(fd, "name");
  const slug = slugify(name);
  if (!slug) return { ok: false, message: "Name the module first." };
  const lanes = fd.getAll("lanes").map(String).filter((l): l is Lane => LANES.includes(l as Lane));

  const { data, error } = await supabase
    .from("modules")
    .insert({
      subsystem_id: str(fd, "subsystem_id"),
      name,
      slug,
      lanes,
      description: opt(fd, "description"),
      parts_yml: `# modules/${slug}/parts.yml — one entry per part: name, drive path, revision\nparts: []\n`,
    })
    .select("id")
    .single();
  if (error) return fail(error);
  revalidatePath("/", "layout");
  redirect(`/modules/${data.id}`);
}

/** Socket a proven module into the active season, keeping its lineage and parts.yml. */
export async function carryModule(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { data: src } = await supabase
    .from("modules")
    .select("*, subsystems(code)")
    .eq("id", str(fd, "module_id"))
    .single();
  if (!src) return { ok: false, message: "That module no longer exists." };

  const { data: season } = await supabase.from("seasons").select("id, prefix, robots(id)").eq("is_active", true).maybeSingle();
  const robot = Array.isArray(season?.robots) ? season?.robots[0] : season?.robots;
  if (!season || !robot) return { ok: false, message: "There's no active season to carry it into." };

  const code = src.subsystems?.code;
  const { data: sub } = await supabase.from("subsystems").select("id").eq("robot_id", robot.id).eq("code", code).maybeSingle();
  if (!sub) return { ok: false, message: `This season has no ${code} subsystem yet — ask a lead to add it first.` };

  const { error } = await supabase.from("modules").insert({
    subsystem_id: sub.id,
    name: src.name,
    slug: src.slug,
    description: src.description,
    lanes: src.lanes,
    parts_yml: src.parts_yml,
    carried_from: src.id,
  });
  if (error) return fail(error);
  return done(`${src.name} socketed into ${season.prefix}`);
}

export async function updateModule(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const lanes = fd.getAll("lanes").map(String).filter((l): l is Lane => LANES.includes(l as Lane));
  const { error } = await supabase
    .from("modules")
    .update({ description: opt(fd, "description"), parts_yml: opt(fd, "parts_yml"), lanes })
    .eq("id", str(fd, "module_id"));
  if (error) return fail(error);
  return done("Saved");
}

export async function setModuleStatus(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const status = str(fd, "status") as Status;
  if (!STATUSES.includes(status)) return { ok: false, message: "Unknown status" };
  const { error } = await supabase.from("modules").update({ status }).eq("id", str(fd, "module_id"));
  if (error) return fail(error);
  return done("Status updated");
}

export async function setProven(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const proven = str(fd, "proven") === "true";
  const { error } = await supabase
    .from("modules")
    .update({ is_proven: proven, proven_note: proven ? opt(fd, "proven_note") : null })
    .eq("id", str(fd, "module_id"));
  if (error) return fail(error);
  return done(proven ? "Added to the reuse library" : "Removed from the library");
}

export async function deleteModule(fd: FormData) {
  const { supabase } = await requireLead();
  const id = str(fd, "module_id");
  await removeStoredFiles(supabase, { moduleId: id });
  await supabase.from("modules").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect("/modules");
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export async function createAsset(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase, isLead } = await requireMember();
  const name = str(fd, "name").toUpperCase().replace(/-V(\d+)$/, "-v$1");
  const status = (str(fd, "status") || "design") as Status;
  const location = str(fd, "location") as Location;
  if (!name) return { ok: false, message: "Name it first." };
  if (!str(fd, "module_id")) return { ok: false, message: "Pick the module it belongs to." };
  if (status === "as_built" && !isLead) return { ok: false, message: "Only leads can mark something as-built." };
  if (location === "drive" && !str(fd, "drive_id")) return { ok: false, message: "Pick which drive the master is on." };
  if ((location === "github" || location === "link") && !str(fd, "url"))
    return { ok: false, message: "Paste the link so people can find it." };

  const { data, error } = await supabase
    .from("assets")
    .insert({
      module_id: str(fd, "module_id"),
      name,
      title: opt(fd, "title"),
      kind: str(fd, "kind"),
      discipline: str(fd, "discipline") as Discipline,
      lane: (opt(fd, "lane") as Lane | null) ?? null,
      location,
      drive_id: location === "drive" ? opt(fd, "drive_id") : null,
      path: opt(fd, "path"),
      url: location === "github" || location === "link" ? opt(fd, "url") : null,
      revision: revisionOf(name),
      status,
      notes: opt(fd, "notes"),
    })
    .select("id")
    .single();
  if (error) return fail(error);

  const check = checkName(name, str(fd, "prefix"), str(fd, "code"));
  return done(check.ok ? `Saved ${name}` : `Saved ${name} — flagged: name doesn't follow the rule`, data.id);
}

export async function updateAsset(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const name = str(fd, "name");
  const { error } = await supabase
    .from("assets")
    .update({
      name,
      title: opt(fd, "title"),
      path: opt(fd, "path"),
      url: opt(fd, "url"),
      drive_id: opt(fd, "drive_id"),
      notes: opt(fd, "notes"),
      revision: revisionOf(name),
    })
    .eq("id", str(fd, "asset_id"));
  if (error) return fail(error);
  return done("Saved");
}

export async function setAssetStatus(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase, isLead } = await requireMember();
  const status = str(fd, "status") as Status;
  if (!STATUSES.includes(status)) return { ok: false, message: "Unknown status" };
  if (status === "as_built" && !isLead) return { ok: false, message: "Only leads can mark something as-built." };
  const { error } = await supabase.from("assets").update({ status }).eq("id", str(fd, "asset_id"));
  if (error) return fail(error);
  return done(status === "as_built" ? "Marked as-built" : "Status updated");
}

export async function deleteAsset(fd: FormData) {
  const { supabase } = await requireLead();
  const id = str(fd, "asset_id");
  const moduleId = str(fd, "module_id");
  await removeStoredFiles(supabase, { assetId: id });
  await supabase.from("assets").delete().eq("id", id);
  revalidatePath("/", "layout");
  redirect(`/modules/${moduleId}`);
}

/** Called by the browser after it has uploaded a file straight to the exports bucket. */
export async function recordFile(input: { assetId: string; path: string; fileName: string; size: number }): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  const kind = ext === "step" || ext === "stp" ? "step" : ext === "pdf" ? "pdf" : ext === "stl" ? "stl" : ["dae", "obj", "glb"].includes(ext) ? "mesh" : "other";
  const { error } = await supabase.from("asset_files").insert({
    asset_id: input.assetId,
    kind,
    storage_path: input.path,
    file_name: input.fileName,
    size_bytes: input.size,
  });
  if (error) {
    await supabase.storage.from("exports").remove([input.path]);
    return fail(error);
  }
  return done(`Uploaded ${input.fileName}`);
}

export async function deleteFile(fd: FormData) {
  const { supabase } = await requireLead();
  const { data: file } = await supabase.from("asset_files").select("*").eq("id", str(fd, "file_id")).single();
  if (file) {
    await supabase.storage.from("exports").remove([file.storage_path]);
    await supabase.from("asset_files").delete().eq("id", file.id);
  }
  revalidatePath("/", "layout");
}

async function removeStoredFiles(
  supabase: Awaited<ReturnType<typeof requireMember>>["supabase"],
  where: { assetId?: string; moduleId?: string },
) {
  let q = supabase.from("asset_files").select("storage_path, assets!inner(module_id)");
  if (where.assetId) q = q.eq("asset_id", where.assetId);
  if (where.moduleId) q = q.eq("assets.module_id", where.moduleId);
  const { data } = await q;
  const paths = (data ?? []).map((f) => f.storage_path);
  if (paths.length) await supabase.storage.from("exports").remove(paths);
}

// ─── Drives ─────────────────────────────────────────────────────────────────

export async function saveDrive(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const id = opt(fd, "drive_id");
  const row = {
    label: str(fd, "label").toUpperCase(),
    custodian_id: opt(fd, "custodian_id"),
    last_mirrored_at: opt(fd, "last_mirrored_at"),
    notes: opt(fd, "notes"),
  };
  if (!row.label) return { ok: false, message: "Label the drive, e.g. DRIVE-A." };
  const { error } = id ? await supabase.from("drives").update(row).eq("id", id) : await supabase.from("drives").insert(row);
  if (error) return fail(error);
  return done(id ? "Saved" : `${row.label} recorded`);
}

export async function deleteDrive(fd: FormData) {
  const { supabase } = await requireLead();
  await supabase.from("drives").delete().eq("id", str(fd, "drive_id"));
  revalidatePath("/", "layout");
}

// ─── Members ────────────────────────────────────────────────────────────────

export async function updateMember(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase, isLead, member } = await requireMember();
  const id = str(fd, "member_id");
  if (!isLead && id !== member.id) return { ok: false, message: "Only leads can edit other members." };

  const patch: Record<string, unknown> = {
    batch: opt(fd, "batch"),
    department: opt(fd, "department"),
  };
  if (isLead && fd.has("role")) patch.role = str(fd, "role") as Role;
  const { error } = await supabase.from("members").update(patch).eq("id", id);
  if (error) return fail(error);
  return done("Saved");
}

export async function approveMember(fd: FormData) {
  const { supabase } = await requireLead();
  await supabase
    .from("members")
    .update({ role: str(fd, "role") as Role, batch: opt(fd, "batch"), department: opt(fd, "department") })
    .eq("id", str(fd, "member_id"));
  revalidatePath("/", "layout");
}

export async function rejectMember(fd: FormData) {
  const { supabase } = await requireLead();
  await supabase.from("members").delete().eq("id", str(fd, "member_id")).eq("role", "pending");
  revalidatePath("/", "layout");
}
