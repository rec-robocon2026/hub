"use client";

import Link from "next/link";
import { useState } from "react";
import { setFocus } from "@/app/(hub)/review-actions";
import { Box, Corners } from "@/components/ui";

type Workspace = { hostname: string; path: string; updated_at: string };

/** vscode://file/C:/Users/aiman/Documents/RC26 — opens an existing copy instead of cloning again. */
function openUrl(path: string) {
  return `vscode://file/${encodeURI(path.replace(/\\/g, "/").replace(/^\/+/, ""))}`;
}

export function WorkOnModule({
  moduleId,
  folder,
  repo,
  cloneUrl,
  workspaces,
  hasKey,
}: {
  moduleId: string;
  folder: string;
  repo: string;
  cloneUrl: string;
  workspaces: Workspace[];
  hasKey: boolean;
}) {
  const [busy, setBusy] = useState(false);
  // Remember the module first, so ./hub.sh start (run by VS Code on open) lands on the right branch.
  const go = async (url: string) => {
    setBusy(true);
    await setFocus(moduleId).catch(() => {});
    window.location.href = url;
    setTimeout(() => setBusy(false), 1500);
  };

  const [latest, ...others] = workspaces;

  return (
    <Box tint className="pad">
      <h5 style={{ margin: "0 0 6px" }}>Work on this module</h5>
      <div className="small" style={{ marginBottom: 12 }}>
        Your folder: <span className="mono">{folder}</span> in <span className="mono">{repo}</span>
      </div>

      <div className="stack" style={{ gap: 8 }}>
        {latest ? (
          <>
            <button type="button" className="btn btn-primary blueprint" disabled={busy} onClick={() => go(openUrl(latest.path))}>
              <Corners />
              {busy ? "Opening VS Code…" : "Open my copy"}
            </button>
            <div className="text-muted small" style={{ lineHeight: 1.5 }}>
              on <strong>{latest.hostname}</strong> · <span className="mono" style={{ fontSize: 11.5 }}>{latest.path}</span>
            </div>
            {others.map((w) => (
              <button key={w.hostname} type="button" className="btn btn-secondary" disabled={busy} onClick={() => go(openUrl(w.path))}>
                Open my copy on {w.hostname}
              </button>
            ))}
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => go(cloneUrl)} style={{ justifySelf: "start", fontSize: 12.5 }}>
              Not on this computer? Clone a fresh copy
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn-primary blueprint" disabled={busy} onClick={() => go(cloneUrl)}>
              <Corners />
              {busy ? "Opening VS Code…" : "Open in VS Code"}
            </button>
            <div className="text-muted small" style={{ lineHeight: 1.55 }}>
              First time: VS Code asks where to save it — pick <strong>Documents</strong>. When it opens, choose
              <strong> Allow</strong> for automatic tasks. After that this button reopens the same copy.
            </div>
          </>
        )}
      </div>

      <div className="small" style={{ marginTop: 14, borderTop: "1px solid var(--color-divider)", paddingTop: 12, lineHeight: 1.7 }}>
        <div>Edit files in <span className="mono">{folder}</span>, then in the VS Code terminal:</div>
        <div className="mono" style={{ margin: "4px 0" }}>./hub.sh propose &quot;what you did&quot;</div>
        <div className="text-muted">A lead reviews it here before it reaches the robot&apos;s code.</div>
        {!hasKey && (
          <div className="note-err" style={{ marginTop: 6 }}>
            You need a terminal key first — <Link href="/members#terminal-key">create one</Link>.
          </div>
        )}
      </div>
    </Box>
  );
}
