import Link from "next/link";
import { approveProposal, closeProposal, requestChanges } from "@/app/(hub)/review-actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Empty, Tag } from "@/components/ui";
import { displayName } from "@/lib/auth";
import { timeAgo } from "@/lib/format";
import type { Proposal } from "@/lib/proposals";
import type { Member } from "@/lib/types";

const STATUS_TAG: Record<Proposal["status"], { text: string; kind: "accent" | "outline" | "neutral" | "warn" }> = {
  open: { text: "AWAITING LEAD", kind: "outline" },
  changes_requested: { text: "CHANGES REQUESTED", kind: "warn" },
  merged: { text: "MERGED", kind: "accent" },
  closed: { text: "CLOSED", kind: "neutral" },
};

export function ProposalList({
  proposals,
  people,
  moduleLabel,
  isLead,
  meId,
  emptyText,
}: {
  proposals: Proposal[];
  people: Map<string, Member>;
  moduleLabel: Map<string, string>;
  isLead: boolean;
  meId: string;
  emptyText: string;
}) {
  if (!proposals.length) return <Empty title="Nothing waiting" body={emptyText} />;
  return (
    <div className="stack" style={{ gap: 14 }}>
      {proposals.map((p) => {
        const author = people.get(p.author_id ?? "");
        const live = p.status === "open" || p.status === "changes_requested";
        return (
          <Box key={p.id} className="pad">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <Link href={`/proposals/${p.id}`} style={{ fontSize: 15, fontWeight: 500, color: "inherit" }}>
                {p.title}
              </Link>
              <div className="row" style={{ gap: 4 }}>
                {p.module_ids.map((id) => (
                  <Tag key={id} kind="neutral">{moduleLabel.get(id) ?? "module"}</Tag>
                ))}
                <Tag kind={STATUS_TAG[p.status].kind}>{STATUS_TAG[p.status].text}</Tag>
              </div>
            </div>
            <div className="text-muted small" style={{ margin: "4px 0 10px" }}>
              {displayName(author)}
              {author?.batch ? ` (batch ${author.batch})` : ""}
              {author?.id === meId ? " · you" : ""} · #{p.pr_number} · {p.files} file{p.files === 1 ? "" : "s"} ·{" "}
              <span className="accent-text">+{p.additions}</span> <span className="note-err">−{p.deletions}</span> · {timeAgo(p.updated_at)}
            </div>
            {p.notes && <p className="small" style={{ margin: "0 0 10px", whiteSpace: "pre-wrap" }}>{p.notes}</p>}
            {p.review_note && live && (
              <div className="small" style={{ margin: "0 0 10px" }}>
                <strong>Lead said:</strong> {p.review_note}
              </div>
            )}
            <div className="row" style={{ gap: 8 }}>
              <Link className="btn btn-secondary" href={`/proposals/${p.id}`} style={{ fontSize: 12.5 }}>
                View changes
              </Link>
              {isLead && live && <ReviewButtons proposalId={p.id} />}
              <a className="btn btn-ghost" href={p.pr_url} target="_blank" rel="noreferrer" style={{ fontSize: 12.5 }}>
                Open on GitHub
              </a>
            </div>
          </Box>
        );
      })}
    </div>
  );
}

export function ReviewButtons({ proposalId }: { proposalId: string }) {
  return (
    <>
      <ActionForm action={approveProposal} className="row" style={{ gap: 6 }}>
        <input type="hidden" name="proposal_id" value={proposalId} />
        <Submit primary pendingText="Merging…">Approve &amp; merge</Submit>
        <FormNotice />
      </ActionForm>
      <details>
        <summary className="btn btn-secondary" style={{ fontSize: 12.5, listStyle: "none" }}>Request changes</summary>
        <ActionForm action={requestChanges} className="stack" style={{ gap: 6, marginTop: 8, minWidth: 280 }}>
          <input type="hidden" name="proposal_id" value={proposalId} />
          <textarea name="note" className="input" rows={3} placeholder="What should they change? They'll see this in the hub and in ./hub.sh" required />
          <div className="row">
            <Submit>Send</Submit>
            <FormNotice />
          </div>
        </ActionForm>
      </details>
      <details>
        <summary className="btn btn-ghost" style={{ fontSize: 12.5, listStyle: "none" }}>Close</summary>
        <ActionForm action={closeProposal} className="stack" style={{ gap: 6, marginTop: 8, minWidth: 260 }}>
          <input type="hidden" name="proposal_id" value={proposalId} />
          <input name="note" className="input" placeholder="Why (optional)" />
          <div className="row">
            <Submit>Close without merging</Submit>
            <FormNotice />
          </div>
        </ActionForm>
      </details>
    </>
  );
}
