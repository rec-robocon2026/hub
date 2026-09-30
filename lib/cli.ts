// Server-only. The protocol between ./hub.sh and the hub: JSON in, KEY=VALUE lines out
// (plain text, so the script needs nothing but bash, sed and curl).
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Member } from "@/lib/types";

export function newTerminalKey() {
  return `rh_${randomBytes(24).toString("base64url")}`;
}

export function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

type Line = [string, string];

/** KEY=VALUE reply. SAY lines are printed to the member as-is, in order. */
export function reply(lines: Line[], status = 200) {
  const body = lines.map(([k, v]) => `${k}=${v.replace(/\r?\n/g, " ")}`).join("\n") + "\n";
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export const say = (text: string): Line => ["SAY", text];
export const fail = (message: string, status = 400) => reply([["ERROR", message]], status);

/** Who is calling, from the Bearer terminal key. Returns a Response to send back on failure. */
export async function cliAuth(request: Request): Promise<{ admin: SupabaseClient; member: Member } | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return reply([["KEY_INVALID", "1"]], 401);
  let admin: SupabaseClient;
  try {
    admin = createAdminClient();
  } catch {
    return fail("The hub isn't set up for terminal use yet (SUPABASE_SECRET_KEY missing). Tell a lead.", 501);
  }
  const { data: key } = await admin.from("cli_keys").select("id, member_id").eq("key_hash", hashKey(token)).maybeSingle();
  if (!key) return reply([["KEY_INVALID", "1"]], 401);
  const { data: member } = await admin.from("members").select("*").eq("id", key.member_id).maybeSingle<Member>();
  if (!member || (member.role !== "member" && member.role !== "lead"))
    return fail("Your hub account isn't approved (or was removed). Ask a lead.", 403);
  await admin.from("cli_keys").update({ last_used_at: new Date().toISOString() }).eq("id", key.id);
  return { admin, member };
}

export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

/** Short handle for branch names: "aiman" from aiman.rahman@… */
export function handleOf(m: Pick<Member, "email" | "full_name">) {
  const base = (m.email.split("@")[0] || m.full_name || "member").toLowerCase();
  return base.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "member";
}
