import { cliAuth, fail, readJson, reply, say } from "@/lib/cli";
import { defaultBranch, isGithubConfigured } from "@/lib/github-api";
import { decideStart, loadRepoContext, type Proposal } from "@/lib/proposals";

// ./hub.sh start — remember where this copy lives, and say which branch to be on.
export async function POST(request: Request) {
  const auth = await cliAuth(request);
  if (auth instanceof Response) return auth;
  const { admin, member } = auth;

  const body = await readJson<{ repo?: string; hostname?: string; path?: string; branch?: string; dirty?: boolean }>(request);
  if (!body?.repo) return fail("Couldn't tell which repo this is. Run ./hub.sh inside the season repo folder.");

  const ctx = await loadRepoContext(admin, body.repo);
  if (!ctx) return fail(`${body.repo} isn't a season repo in the hub. Open it from a module page in the hub instead.`);

  if (body.hostname && body.path) {
    await admin.from("workspaces").upsert(
      { member_id: member.id, repo: ctx.season.repo, hostname: body.hostname, path: body.path, updated_at: new Date().toISOString() },
      { onConflict: "member_id,repo,hostname" },
    );
  }

  const { data: mine } = await admin
    .from("proposals")
    .select("branch, status, title, review_note, module_ids")
    .eq("repo", ctx.season.repo)
    .eq("author_id", member.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  const main = isGithubConfigured() ? await defaultBranch(ctx.season.repo).catch(() => "main") : "main";
  const decision = decideStart({
    current: body.branch ?? main,
    defaultBranch: main,
    mine: (mine as Proposal[] | null) ?? [],
    focusModuleId: member.focus_module_id ?? null,
  });

  const focus = [...ctx.modules.values()].find((m) => m.id === member.focus_module_id);
  const lines = [
    ...(decision.switchTo ? [["SWITCH", decision.switchTo] as [string, string]] : []),
    say(`Hi ${member.full_name?.split(" ")[0] ?? "there"} · ${ctx.season.prefix}`),
    ...(focus ? [say(`You're working on: ${focus.robot}/${focus.slug}/  (${focus.name} · ${focus.subsystem})`)] : []),
    ...decision.say.map(say),
  ];
  return reply(lines);
}
