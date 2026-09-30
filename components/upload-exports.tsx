"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FileDrop } from "@/components/file-drop";
import { Corners, Notice } from "@/components/ui";
import type { ActionResult } from "@/lib/types";
import { uploadToAsset } from "@/lib/upload";

export function UploadExports({ assetId, hint, accept }: { assetId: string; hint: string; accept?: string }) {
  const router = useRouter();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);

  const upload = async () => {
    setBusy(true);
    setResult(null);
    const failed: string[] = [];
    for (const f of files) {
      const r = await uploadToAsset(assetId, f);
      if (!r.ok) failed.push(r.message ?? f.name);
    }
    setBusy(false);
    setFiles([]);
    setResult(failed.length ? { ok: false, message: failed.join("; ") } : { ok: true, message: "Uploaded" });
    router.refresh();
  };

  return (
    <div className="stack">
      <FileDrop files={files} onChange={setFiles} hint={hint} accept={accept} />
      <div className="row">
        <button type="button" className="btn btn-primary blueprint" disabled={!files.length || busy} onClick={upload}>
          <Corners />
          {busy ? "Uploading…" : `Upload ${files.length || ""} file${files.length === 1 ? "" : "s"}`}
        </button>
        <Notice result={result} />
      </div>
    </div>
  );
}
