"use server";

import { revalidatePath } from "next/cache";
import { displayName, requireLead, requireMember } from "@/lib/auth";
import { hashKey, newTerminalKey } from "@/lib/cli";
import { closePull, commentOnPull, deleteBranch, getPull, githubErrorMessage, mergePull } from "@/lib/github-api";
import type { Proposal } from "@/lib/proposals";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionResult } from "@/lib/types";

// Terminal keys, "which module am I on", and the lead's review buttons.
// Writes go through the service-role client, always after requireMember / requireLead.

type State = ActionResult | null;

/** One key per member: making a new one replaces the old. The plain key is shown once and never stored. */
export async function createTerminalKey(): Promise<ActionResult & { key?: string }> {
  const { member } = await requireMember();
  const admin = createAdminClient();
  const key = newTerminalKey();
  await admin.from("cli_keys").delete().eq("member_id", member.id);
  const { error } = await admin.from("cli_keys").insert({ member_id: member.id, key_hash: hashKey(key) });
  if (error) return { ok: false, message: error.message };
  revalidatePath("/members");
  return { ok: true, key };
}

export async function revokeTerminalKey() {
  const { member } = await requireMember();
  await createAdminClient().from("cli_keys").delete().eq("member_id", member.id);
  revalidatePath("/members");
}

/** Remember the module a member opened from the hub, so ./hub.sh start lands on the right branch. */
export async function setFocus(moduleId: string) {
  const { supabase, member } = await requireMember();
  await supabase.from("members").update({ focus_module_id: moduleId }).eq("id", member.id);
}

async function loadProposal(id: string) {
  const admin = createAdminClient();
  const { data } = await admin.from("proposals").select("*").eq("id", id).maybeSingle<Proposal>();
  return { admin, proposal: data };
}

export async function approveProposal(_: State, fd: FormData): Promise<ActionResult> {
  const { member: lead } = await requireLead();
  const { admin, proposal } = await loadProposal(String(fd.get("proposal_id")));
  if (!proposal) return { ok: false, message: "That request no longer exists." };
  if (proposal.status === "merged" || proposal.status === "closed") return { ok: false, message: "Already finished." };

  const { data: author } = await admin.from("members").select("full_name, email").eq("id", proposal.author_id ?? "").maybeSingle();
  try {
    const pr = await getPull(proposal.repo, proposal.pr_number);
    if (pr.merged) {
      // Merged on GitHub already; just catch up.
    } else if (pr.state === "closed") {
      await admin.from("proposals").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", proposal.id);
      revalidatePath("/", "layout");
      return { ok: false, message: "It was closed on GitHub." };
    } else {
      await mergePull(
        proposal.repo,
        proposal.pr_number,
        `${proposal.title} (#${proposal.pr_number})`,
        `Proposed by ${displayName(author)} · Approved by ${displayName(lead)} via the Robocon Hub`,
      );
    }
    await deleteBranch(proposal.repo, proposal.branch);
  } catch (e) {
    return { ok: false, message: githubErrorMessage(e) };
  }

  await admin
    .from("proposals")
    .update({ status: "merged", reviewer_id: lead.id, updated_at: new Date().toISOString() })
    .eq("id", proposal.id);
  if (proposal.module_ids.length)
    await admin.from("events").insert(
      proposal.module_ids.map((moduleId) => ({
        module_id: moduleId,
        actor_id: lead.id,
        action: `approved & merged: ${proposal.title}`,
        detail: `#${proposal.pr_number} by ${displayName(author)}`,
      })),
    );
  revalidatePath("/", "layout");
  return { ok: true, message: "Merged into main" };
}

export async function requestChanges(_: State, fd: FormData): Promise<ActionResult> {
  const { member: lead } = await requireLead();
  const note = String(fd.get("note") ?? "").trim();
  if (!note) return { ok: false, message: "Say what needs changing." };
  const { admin, proposal } = await loadProposal(String(fd.get("proposal_id")));
  if (!proposal) return { ok: false, message: "That request no longer exists." };
  try {
    await commentOnPull(proposal.repo, proposal.pr_number, `**Changes requested by ${displayName(lead)}:**\n\n${note}`);
  } catch (e) {
    return { ok: false, message: githubErrorMessage(e) };
  }
  await admin
    .from("proposals")
    .update({ status: "changes_requested", review_note: note, reviewer_id: lead.id, updated_at: new Date().toISOString() })
    .eq("id", proposal.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Sent — they'll see it in the hub and in ./hub.sh" };
}

export async function closeProposal(_: State, fd: FormData): Promise<ActionResult> {
  const { member: lead } = await requireLead();
  const { admin, proposal } = await loadProposal(String(fd.get("proposal_id")));
  if (!proposal) return { ok: false, message: "That request no longer exists." };
  const note = String(fd.get("note") ?? "").trim();
  try {
    if (note) await commentOnPull(proposal.repo, proposal.pr_number, `**Closed by ${displayName(lead)}:** ${note}`);
    await closePull(proposal.repo, proposal.pr_number);
    await deleteBranch(proposal.repo, proposal.branch);
  } catch (e) {
    return { ok: false, message: githubErrorMessage(e) };
  }
  await admin
    .from("proposals")
    .update({ status: "closed", review_note: note || null, reviewer_id: lead.id, updated_at: new Date().toISOString() })
    .eq("id", proposal.id);
  revalidatePath("/", "layout");
  return { ok: true, message: "Closed" };
}
