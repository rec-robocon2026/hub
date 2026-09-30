import Link from "next/link";
import { notFound } from "next/navigation";
import { ProposalList } from "@/components/proposal-list";
import { Box, PageHead } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { loadMembers, memberMap } from "@/lib/data";
import { githubErrorMessage, isGithubConfigured, pullFiles, type PullFile } from "@/lib/github-api";
import { moduleLabels, type Proposal } from "@/lib/proposals";

export async function generateMetadata({ params }: PageProps<"/proposals/[id]">) {
  return { title: `Request ${(await params).id.slice(0, 6)}` };
}

export default async function ProposalPage({ params }: PageProps<"/proposals/[id]">) {
  const { id } = await params;
  const { supabase, isLead, member } = await requireMember();
  const { data } = await supabase.from("proposals").select("*").eq("id", id).maybeSingle<Proposal>();
  if (!data) notFound();

  const [members, labels] = await Promise.all([loadMembers(supabase), moduleLabels(supabase, data.module_ids)]);

  let files: PullFile[] = [];
  let error = "";
  if (isGithubConfigured()) {
    try {
      files = await pullFiles(data.repo, data.pr_number);
    } catch (e) {
      error = githubErrorMessage(e);
    }
  } else error = "GitHub isn't connected, so the changes can't be shown here.";

  return (
    <main className="page">
      <div className="text-muted small" style={{ marginBottom: 6 }}>
        <Link href="/programming#review">Awaiting review</Link> / #{data.pr_number}
      </div>
      <PageHead kicker={`${data.repo} · ${data.branch}`} title={data.title} />

      <ProposalList proposals={[data]} people={memberMap(members)} moduleLabel={labels} isLead={isLead} meId={member.id} emptyText="" />

      <h3 className="section" style={{ margin: "36px 0 12px" }}>Changes</h3>
      {error && <p className="note-err">{error}</p>}
      <div className="stack" style={{ gap: 18 }}>
        {files.map((f) => (
          <Box key={f.filename} className="diff-file">
            <div className="diff-head">
              <span className="mono">{f.filename}</span>
              <span className="small">
                {f.status !== "modified" && <span className="text-muted">{f.status} · </span>}
                <span className="accent-text">+{f.additions}</span> <span className="note-err">−{f.deletions}</span>
              </span>
            </div>
            {f.patch ? (
              <pre className="diff">
                {f.patch.split("\n").map((line, i) => (
                  <span key={i} className={line.startsWith("+") ? "add" : line.startsWith("-") ? "del" : line.startsWith("@@") ? "hunk" : ""}>
                    {line}
                    {"\n"}
                  </span>
                ))}
              </pre>
            ) : (
              <div className="text-muted small" style={{ padding: "10px 14px" }}>
                No text preview (binary or very large file) — open it on GitHub.
              </div>
            )}
          </Box>
        ))}
      </div>
    </main>
  );
}
