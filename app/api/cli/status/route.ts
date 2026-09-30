import { cliAuth, fail, readJson, reply, say } from "@/lib/cli";
import { loadRepoContext, STATUS_TEXT, type Proposal } from "@/lib/proposals";

// ./hub.sh status — your requests in this repo and what a lead said.
export async function POST(request: Request) {
  const auth = await cliAuth(request);
  if (auth instanceof Response) return auth;
  const { admin, member } = auth;

  const body = await readJson<{ repo?: string; branch?: string }>(request);
  if (!body?.repo) return fail("Run ./hub.sh inside the season repo folder.");
  const ctx = await loadRepoContext(admin, body.repo);
  if (!ctx) return fail(`${body.repo} isn't a season repo in the hub.`);

  const { data } = await admin
    .from("proposals")
    .select("*")
    .eq("repo", ctx.season.repo)
    .eq("author_id", member.id)
    .order("updated_at", { ascending: false })
    .limit(8);
  const mine = (data as Proposal[] | null) ?? [];
  if (!mine.length) return reply([say("No requests yet. When you're done:  ./hub.sh propose \"what you did\"")]);

  const lines = mine.flatMap((p) => [
    say(`${p.branch === body.branch ? "→ " : "  "}#${p.pr_number} "${p.title}" — ${STATUS_TEXT[p.status]}`),
    ...(p.review_note && p.status === "changes_requested" ? [say(`     Lead said: ${p.review_note}`)] : []),
  ]);
  return reply(lines);
}
