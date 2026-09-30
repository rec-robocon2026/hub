import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/types";

/** The signed-in user and their member row, once per request. */
export const getViewer = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: member } = await supabase.from("members").select("*").eq("id", user.id).maybeSingle();
  return { user, member: member as Member | null, supabase };
});

export function isApproved(member: Member | null) {
  return member?.role === "member" || member?.role === "lead";
}

/** Signed in and approved (member or lead) — otherwise off to /login or /pending. */
export async function requireMember() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login");
  if (!isApproved(viewer.member)) redirect("/pending");
  const member = viewer.member as Member;
  return { ...viewer, member, isLead: member.role === "lead" };
}

export async function requireLead() {
  const viewer = await requireMember();
  if (!viewer.isLead) redirect("/");
  return viewer;
}

export function displayName(m: Pick<Member, "full_name" | "email"> | null | undefined) {
  if (!m) return "someone";
  return m.full_name || m.email.split("@")[0];
}
