"use server";

import type { PostgrestError } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLead, requireMember } from "@/lib/auth";
import { syncModule, syncRobot, syncSeason } from "@/lib/github-sync";
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

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return h.get("origin") ?? (host ? `${h.get("x-forwarded-proto") ?? "https"}://${host}` : null);
}

/** ?gh=… on a redirect so the next page can show what happened on GitHub. */
function ghParam(r: { ok: boolean; note: string }) {
  return `gh=${encodeURIComponent(r.note)}&ghok=${r.ok ? 1 : 0}`;
}

function done(message: string, id?: string): ActionResult {
  revalidatePath("/", "layout");
  return { ok: true, message, id };
}

// ─── Seasons ────────────────────────────────────────────────────────────────

export async function startSeason(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const year = Number(str(fd, "year"));
  if (!year || year < 2000 || year > 2099) return { ok: false, message: "Enter the season year, e.g. 2027." };

  // Robots come in as robot_code[] / robot_codename[] / robot_description[] rows; blank codenames are skipped.
  const codes = fd.getAll("robot_code").map(String);
  const names = fd.getAll("robot_codename").map((v) => String(v).trim());
  const descs = fd.getAll("robot_description").map((v) => String(v).trim());
  const robots = codes
    .map((code, i) => ({ code, codename: names[i], description: descs[i] || null }))
    .filter((r) => r.codename);
  if (!robots.some((r) => r.code !== "RD")) return { ok: false, message: "Give at least one competition robot a codename." };

  const { data: seasonId, error } = await supabase.rpc("start_season", {
    p_year: year,
    p_robots: robots,
    p_codes: fd.getAll("codes").map(String),
    p_carry: fd.getAll("carry").map(String),
    p_repo: cleanRepo(opt(fd, "repo")),
  });
  if (error) return fail(error);
  // Creates rec-robocon2026/RC26 (unless a repo was given) with R1/ R2/ RD/ and any carried modules.
  const gh = await syncSeason(supabase, seasonId as string, await requestOrigin());
  revalidatePath("/", "layout");
  redirect(`/season/${year}?${ghParam(gh)}`);
}

export async function syncSeasonToGithub(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const gh = await syncSeason(supabase, str(fd, "season_id"), await requestOrigin());
  revalidatePath("/", "layout");
  return { ok: gh.ok, message: gh.note };
}

function cleanRepo(repo: string | null) {
  return repo?.replace(/^https?:\/\/github\.com\//, "").replace(/\.git$|\/$/g, "") || null;
}

export async function updateSeason(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const { error } = await supabase
    .from("seasons")
    .update({ repo: cleanRepo(opt(fd, "repo")), result: opt(fd, "result") })
    .eq("id", str(fd, "season_id"));
  if (error) return fail(error);
  return done("Saved");
}

// ─── Robots ─────────────────────────────────────────────────────────────────

export async function addRobot(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const code = str(fd, "code").toUpperCase();
  const codename = str(fd, "codename").toUpperCase();
  if (!/^(R[1-9]|RD)$/.test(code)) return { ok: false, message: "Robot code is R1–R9, or RD for the R&D bench." };
  if (!codename) return { ok: false, message: "Give it a codename." };
  const { data, error } = await supabase
    .from("robots")
    .insert({ season_id: str(fd, "season_id"), code, codename, description: opt(fd, "description") })
    .select("id")
    .single();
  if (error) return fail(error);
  const subsystemCodes = fd.getAll("codes").map(String);
  if (subsystemCodes.length) {
    const { error: e2 } = await supabase.from("subsystems").insert(subsystemCodes.map((c) => ({ robot_id: data.id, code: c })));
    if (e2) return fail(e2);
  }
  const gh = await syncRobot(supabase, data.id);
  return done(`${code} ${codename} added · ${gh.note}`);
}

export async function updateRobot(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireLead();
  const { error } = await supabase
    .from("robots")
    .update({ codename: str(fd, "codename").toUpperCase(), description: opt(fd, "description") })
    .eq("id", str(fd, "robot_id"));
  if (error) return fail(error);
  return done("Saved");
}

export async function deleteRobot(fd: FormData) {
  const { supabase } = await requireLead();
  const robotId = str(fd, "robot_id");
  const { data: subs } = await supabase.from("subsystems").select("id").eq("robot_id", robotId);
  const { count } = await supabase
    .from("modules")
    .select("id", { count: "exact", head: true })
    .in("subsystem_id", (subs ?? []).map((s) => s.id));
  if (count) return; // only robots with no modules can be removed; the button is hidden otherwise
  await supabase.from("robots").delete().eq("id", robotId);
  revalidatePath("/", "layout");
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
  const description = str(fd, "description");
  const mechanism = str(fd, "mechanism");
  if (!description) return { ok: false, message: "Say what the module does — the hub names it for you." };
  if (!mechanism) return { ok: false, message: "Describe how version 1 works." };
  const lanes = fd.getAll("lanes").map(String).filter((l): l is Lane => LANES.includes(l as Lane));

  // name and slug are placeholders: the database replaces them with the next code, e.g. RC26-R1-GRP-03 / grp-03.
  const { data, error } = await supabase
    .from("modules")
    .insert({
      subsystem_id: str(fd, "subsystem_id"),
      name: "-",
      slug: "x",
      lanes,
      description,
      parts_yml: "# one entry per part: name, drive path, revision\nparts: []\n",
    })
    .select("id")
    .single();
  if (error) return fail(error);
  await supabase.from("module_versions").update({ mechanism }).eq("module_id", data.id).eq("number", 1);
  const gh = await syncModule(supabase, data.id);
  revalidatePath("/", "layout");
  redirect(`/modules/${data.id}?${ghParam(gh)}`);
}

/** Socket a proven module onto a robot of the active season, keeping its lineage and parts.yml. */
export async function carryModule(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { data: src } = await supabase
    .from("modules")
    .select("*, subsystems(code)")
    .eq("id", str(fd, "module_id"))
    .single();
  if (!src) return { ok: false, message: "That module no longer exists." };

  const { data: robot } = await supabase
    .from("robots")
    .select("id, code, codename, seasons!inner(prefix, is_active)")
    .eq("id", str(fd, "robot_id"))
    .maybeSingle();
  const season = (Array.isArray(robot?.seasons) ? robot?.seasons[0] : robot?.seasons) as { prefix: string; is_active: boolean } | undefined;
  if (!robot || !season?.is_active) return { ok: false, message: "Pick a robot in the active season." };

  const code = src.subsystems?.code;
  const { data: sub } = await supabase.from("subsystems").select("id").eq("robot_id", robot.id).eq("code", code).maybeSingle();
  if (!sub) return { ok: false, message: `${robot.code} has no ${code} subsystem yet — ask a lead to add it first.` };

  const { data: created, error } = await supabase
    .from("modules")
    .insert({
      subsystem_id: sub.id,
      name: "-",
      slug: "x",
      description: src.description,
      lanes: src.lanes,
      parts_yml: src.parts_yml,
      carried_from: src.id,
    })
    .select("id, name")
    .single();
  if (error) return fail(error);
  const gh = await syncModule(supabase, created.id);
  return done(`${src.name} socketed onto ${season.prefix}-${robot.code} as ${created.name} · ${gh.note}`);
}

export async function updateModule(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const lanes = fd.getAll("lanes").map(String).filter((l): l is Lane => LANES.includes(l as Lane));
  if (!str(fd, "description")) return { ok: false, message: "Keep a description — it's how people recognise the module." };
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

// ─── Versions: one per mechanism ────────────────────────────────────────────

/** A new mechanism for the module. It becomes current; new items land on it. */
export async function startVersion(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const mechanism = str(fd, "mechanism");
  if (!mechanism) return { ok: false, message: "Describe the new mechanism." };
  const { data, error } = await supabase
    .from("module_versions")
    .insert({ module_id: str(fd, "module_id"), mechanism, why: opt(fd, "why") })
    .select("number")
    .single();
  if (error) return fail(error);
  const outcome = str(fd, "previous_outcome");
  if (outcome)
    await supabase.from("module_versions").update({ outcome }).eq("module_id", str(fd, "module_id")).eq("number", data.number - 1);
  return done(`Started v${data.number} — new items go there`);
}

export async function updateVersion(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const mechanism = str(fd, "mechanism");
  if (!mechanism) return { ok: false, message: "Keep the mechanism description." };
  const { error } = await supabase
    .from("module_versions")
    .update({ mechanism, why: opt(fd, "why"), outcome: opt(fd, "outcome") })
    .eq("id", str(fd, "version_id"));
  if (error) return fail(error);
  return done("Saved");
}

/** Go back to an earlier mechanism (or forward again). Logged in the module's history. */
export async function setCurrentVersion(fd: FormData) {
  const { supabase } = await requireMember();
  await supabase.from("modules").update({ current_version: Number(str(fd, "number")) }).eq("id", str(fd, "module_id"));
  revalidatePath("/", "layout");
}

// ─── Assets ─────────────────────────────────────────────────────────────────

export async function createAsset(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase, isLead } = await requireMember();
  const status = (str(fd, "status") || "design") as Status;
  const location = str(fd, "location") as Location;
  if (!str(fd, "module_id")) return { ok: false, message: "Pick the module it belongs to." };
  if (!str(fd, "title")) return { ok: false, message: "Describe what it is — the hub names it for you." };
  if (status === "as_built" && !isLead) return { ok: false, message: "Only leads can mark something as-built." };
  if (location === "drive" && !str(fd, "drive_id")) return { ok: false, message: "Pick which drive the master is on." };
  if ((location === "github" || location === "link") && !str(fd, "url"))
    return { ok: false, message: "Paste the link so people can find it." };

  const { data, error } = await supabase
    .from("assets")
    .insert({
      module_id: str(fd, "module_id"),
      version_id: opt(fd, "version_id"),
      name: "-", // replaced by the database: RC26-R1-GRP-03-v2-ASM
      title: opt(fd, "title"),
      kind: str(fd, "kind"),
      discipline: str(fd, "discipline") as Discipline,
      lane: (opt(fd, "lane") as Lane | null) ?? null,
      location,
      drive_id: location === "drive" ? opt(fd, "drive_id") : null,
      path: opt(fd, "path"),
      url: location === "github" || location === "link" ? opt(fd, "url") : null,
      status,
      notes: opt(fd, "notes"),
    })
    .select("id, name")
    .single();
  if (error) return fail(error);
  return done(`Saved as ${data.name}`, data.id);
}

export async function updateAsset(_: State, fd: FormData): Promise<ActionResult> {
  const { supabase } = await requireMember();
  if (!str(fd, "title")) return { ok: false, message: "Keep a description." };
  const { data, error } = await supabase
    .from("assets")
    .update({
      title: opt(fd, "title"),
      path: opt(fd, "path"),
      url: opt(fd, "url"),
      drive_id: opt(fd, "drive_id"),
      notes: opt(fd, "notes"),
      ...(str(fd, "version_id") ? { version_id: str(fd, "version_id") } : {}),
    })
    .eq("id", str(fd, "asset_id"))
    .select("name")
    .single();
  if (error) return fail(error);
  return done(`Saved · ${data.name}`);
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

/** Leads only. Removes the person from the hub; they can sign in again and ask, arriving as pending. */
export async function removeMember(fd: FormData) {
  const { supabase, member } = await requireLead();
  const id = str(fd, "member_id");
  if (id === member.id) return; // never yourself — ask another lead
  await supabase.from("members").delete().eq("id", id);
  revalidatePath("/", "layout");
}

export async function rejectMember(fd: FormData) {
  const { supabase } = await requireLead();
  await supabase.from("members").delete().eq("id", str(fd, "member_id")).eq("role", "pending");
  revalidatePath("/", "layout");
}
