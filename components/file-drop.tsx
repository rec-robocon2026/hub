"use client";

import { useRef, useState } from "react";
import { Corners } from "@/components/ui";
import { fileSize } from "@/lib/format";
import { MAX_BYTES } from "@/lib/upload";

/** Drop zone that just collects files; the parent decides when to upload them. */
export function FileDrop({
  files,
  onChange,
  hint,
  accept,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  hint: string;
  accept?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const add = (list: FileList | null) => {
    if (!list) return;
    onChange([...files, ...Array.from(list)]);
  };

  return (
    <div>
      <label
        className={`blueprint drop ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          add(e.dataTransfer.files);
        }}
      >
        <Corners />
        <div className="drop-title">Drop files here, or click to choose</div>
        <div className="text-muted small">{hint} — up to 50 MB each</div>
        <input ref={input} type="file" multiple accept={accept} hidden onChange={(e) => add(e.target.files)} />
      </label>
      {files.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {files.map((f, i) => (
            <div key={i} className="file-row">
              <span className="mono">{f.name}</span>
              <span className="row">
                <span className={f.size > MAX_BYTES ? "note-err" : "text-muted"}>
                  {fileSize(f.size)}
                  {f.size > MAX_BYTES ? " · too big" : ""}
                </span>
                <button type="button" className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => onChange(files.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
