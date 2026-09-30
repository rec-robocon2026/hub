"use client";

import { useState } from "react";
import { createTerminalKey, revokeTerminalKey } from "@/app/(hub)/review-actions";
import { Box } from "@/components/ui";
import { timeAgo } from "@/lib/format";

/** The key ./hub.sh uses to say who is proposing. Shown once when created; only a hash is stored. */
export function TerminalKey({ existing }: { existing: { created_at: string; last_used_at: string | null } | null }) {
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    setBusy(true);
    setError("");
    const r = await createTerminalKey();
    setBusy(false);
    if (r.ok && r.key) setKey(r.key);
    else setError(r.message ?? "Couldn't create a key.");
  };

  const copy = async () => {
    if (!key) return;
    await navigator.clipboard.writeText(key).catch(() => {});
    setCopied(true);
  };

  return (
    <Box className="pad" style={{ maxWidth: 640 }}>
      <h5 id="terminal-key" style={{ margin: "0 0 6px" }}>Your terminal key</h5>
      <p className="text-muted small" style={{ margin: "0 0 12px" }}>
        <span className="mono">./hub.sh</span> uses it to know it&apos;s you. The first time you run it on a computer, it asks for
        this key — paste it and press Enter. Treat it like a password.
      </p>
      {key ? (
        <div className="stack" style={{ gap: 8 }}>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input className="input mono" readOnly value={key} onFocus={(e) => e.currentTarget.select()} style={{ fontSize: 12.5 }} />
            <button type="button" className="btn btn-secondary" onClick={copy}>{copied ? "Copied" : "Copy"}</button>
          </div>
          <div className="note-ok">Copy it now — it won&apos;t be shown again. Making a new key replaces this one.</div>
        </div>
      ) : (
        <div className="row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={create}>
            {busy ? "Creating…" : existing ? "Replace my key" : "Create my key"}
          </button>
          {existing && (
            <>
              <span className="text-muted small">
                Current key made {timeAgo(existing.created_at)}
                {existing.last_used_at ? ` · last used ${timeAgo(existing.last_used_at)}` : " · not used yet"}
              </span>
              <form action={revokeTerminalKey}>
                <button className="btn btn-ghost" type="submit" style={{ fontSize: 12.5 }}>Revoke</button>
              </form>
            </>
          )}
          {error && <span className="note-err">{error}</span>}
        </div>
      )}
    </Box>
  );
}
