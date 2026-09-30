import { cliAuth, fail, handleOf, readJson, reply, say } from "@/lib/cli";
import {
  branchHead,
  commentOnPull,
  commitToBranch,
  defaultBranch,
  getPull,
  githubErrorMessage,
  isGithubConfigured,
  openPull,
  type ProposedFile,
} from "@/lib/github-api";
import { loadRepoContext, proposalBranch, type Proposal } from "@/lib/proposals";

// ./hub.sh propose "…" — commit the member's changes on a branch as them, and open (or update) a pull request.

type Body = {
  repo?: string;
  branch?: string;
  base?: string;
  title?: string;
  notes?: string;
  hostname?: string;
  path?: string;
  files?: ProposedFile[];
};

const MODULE_PATH = /^(R[1-9]|RD)\/([a-z0-9-]+)\/.+/;

export async function POST(request: Request) {
  const auth = await cliAuth(request);
  if (auth instanceof Response) return auth;
  const { admin, member } = auth;
  if (!isGithubConfigured()) return fail("The hub isn't connected to GitHub yet (GITHUB_TOKEN). Tell a lead.", 501);

  const body = await readJson<Body>(request);
  if (!body?.repo || !body.base || !body.files) return fail("That request was incomplete. Run ./hub.sh propose again.");
  const title = (body.title ?? "").trim().slice(0, 120);
  if (!title) return fail('Say what you did:  ./hub.sh propose "fix servo limits"');
  if (!body.files.length) return fail("Nothing to propose.");
  if (body.files.length > 300) return fail("That's over 300 files in one go. Split it into smaller requests.");

  const ctx = await loadRepoContext(admin, body.repo);
  if (!ctx) return fail(`${body.repo} isn't a season repo in the hub.`);
  const repo = ctx.season.repo;

  // Only files inside module folders the hub knows about — keeps the repo tidy and each request traceable.
  const outside = body.files.filter((f) => !MODULE_PATH.test(f.path)).map((f) => f.path);
  if (outside.length)
    return fail(`Only files inside a module folder (like R1/claw/…) can be proposed. Not allowed: ${outside.slice(0, 5).join(", ")}${outside.length > 5 ? " …" : ""}`);
  const touched = new Map<string, string>();
  const unknown = new Set<string>();
  for (const f of body.files) {
    const [, robot, slug] = MODULE_PATH.exec(f.path)!;
    const m = ctx.modules.get(`${robot}/${slug}`);
    if (m) touched.set(m.id, `${robot}/${slug}`);
    else unknown.add(`${robot}/${slug}/`);
  }
  if (unknown.size)
    return fail(`${[...unknown].join(", ")} isn't a module in the hub yet. Create it in the hub first (Modules → New module), then propose again.`);

  const author = { name: member.full_name || member.email, email: member.email };
  const message = body.notes?.trim() ? `${title}\n\n${body.notes.trim()}` : title;

  try {
    const main = await defaultBranch(repo);
    const { data: existing } = await admin
      .from("proposals")
      .select("*")
      .eq("repo", repo)
      .eq("branch", body.branch ?? "")
      .eq("author_id", member.id)
      .in("status", ["open", "changes_requested"])
      .maybeSingle<Proposal>();

    let proposal: Proposal;
    if (existing) {
      // Add to the same request.
      const head = await branchHead(repo, existing.branch);
      if (head !== body.base) return fail("Your copy is behind this request. Run ./hub.sh start, then propose again.");
      await commitToBranch({ repo, parent: head, branch: existing.branch, create: false, files: body.files, message, author });
      await commentOnPull(repo, existing.pr_number, `**Updated by ${author.name}:** ${title}${body.notes?.trim() ? `\n\n${body.notes.trim()}` : ""}`);
      const modules = [...new Set([...existing.module_ids, ...touched.keys()])];
      const { data } = await admin
        .from("proposals")
        .update({ status: "open", module_ids: modules, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .select("*")
        .single<Proposal>();
      proposal = data!;
    } else {
      // New request: a fresh branch from where the member started.
      let branch = proposalBranch(ctx.season.prefix, handleOf(member), title);
      for (let i = 2; (await branchHead(repo, branch)) && i < 50; i++) branch = `${proposalBranch(ctx.season.prefix, handleOf(member), title)}-${i}`;
      await commitToBranch({ repo, parent: body.base, branch, create: true, files: body.files, message, author });
      const where = [...new Set(touched.values())].map((p) => `\`${p}/\``).join(", ");
      const pr = await openPull(repo, {
        title,
        head: branch,
        base: main,
        body: [
          body.notes?.trim() || "_No notes._",
          "",
          "---",
          `Proposed by **${author.name}**${member.batch ? ` (batch ${member.batch})` : ""} via the Robocon Hub · ${where}`,
          "A lead approves this in the hub (Programming → Awaiting review) or here on GitHub.",
        ].join("\n"),
      });
      const { data } = await admin
        .from("proposals")
        .insert({
          season_id: ctx.season.id,
          repo,
          pr_number: pr.number,
          pr_url: pr.html_url,
          branch,
          title,
          notes: body.notes?.trim() || null,
          author_id: member.id,
          module_ids: [...touched.keys()],
        })
        .select("*")
        .single<Proposal>();
      proposal = data!;
    }

    // Numbers for the review panel (GitHub computes them a moment after the push).
    const pr = await getPull(repo, proposal.pr_number).catch(() => null);
    if (pr) await admin.from("proposals").update({ files: pr.changed_files, additions: pr.additions, deletions: pr.deletions }).eq("id", proposal.id);

    await admin.from("events").insert(
      [...touched.entries()].map(([moduleId, folder]) => ({
        module_id: moduleId,
        actor_id: member.id,
        action: existing ? `updated request: ${title}` : `proposed: ${title}`,
        detail: `#${proposal.pr_number} · ${folder}/`,
      })),
    );

    if (body.hostname && body.path)
      await admin.from("workspaces").upsert(
        { member_id: member.id, repo, hostname: body.hostname, path: body.path, updated_at: new Date().toISOString() },
        { onConflict: "member_id,repo,hostname" },
      );

    return reply([
      ["BRANCH", proposal.branch],
      ["PR", proposal.pr_url],
      say(existing ? `✓ Added to your request #${proposal.pr_number} "${proposal.title}".` : `✓ Sent! Request #${proposal.pr_number} "${title}" is waiting for a lead.`),
      say("You'll see the review in the hub. Keep editing and propose again to add to it."),
    ]);
  } catch (e) {
    return fail(`GitHub said no: ${githubErrorMessage(e)}`, 502);
  }
}
