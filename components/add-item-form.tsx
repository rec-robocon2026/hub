"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useState } from "react";
import { createAsset } from "@/app/(hub)/actions";
import { Submit } from "@/components/action-form";
import { FileDrop } from "@/components/file-drop";
import { Box, Notice } from "@/components/ui";
import { DISCIPLINES, LOCATION_LABEL, LOCATION_PLACEHOLDER } from "@/lib/disciplines";
import { STATUS_LABEL } from "@/lib/format";
import { itemName } from "@/lib/naming";
import type { ActionResult, Discipline, Location, Status } from "@/lib/types";
import { STATUSES } from "@/lib/types";
import { uploadToAsset } from "@/lib/upload";

export type ModuleOption = {
  id: string;
  name: string; // RC26-R1-GRP-03
  description: string;
  slug: string;
  current: number;
  versions: { id: string; number: number; mechanism: string }[];
  code: string;
  robot: string;
  prefix: string;
};
export type DriveOption = { id: string; label: string };


/** The Add form on each department page — same record, discipline-specific kinds and locations. */
export function AddItemForm({
  discipline,
  modules,
  drives,
  isLead,
  defaultModuleId,
}: {
  discipline: Discipline;
  modules: ModuleOption[];
  drives: DriveOption[];
  isLead: boolean;
  defaultModuleId?: string;
}) {
  const cfg = DISCIPLINES[discipline];
  const router = useRouter();
  const [moduleId, setModuleId] = useState(defaultModuleId ?? modules[0]?.id ?? "");
  const [location, setLocation] = useState<Location>(cfg.defaultLocation);
  const [kind, setKind] = useState(cfg.kinds[0].label);
  const [status, setStatus] = useState<Status>("design");
  const [files, setFiles] = useState<File[]>([]);

  const mod = modules.find((m) => m.id === moduleId);
  const [versionPick, setVersionPick] = useState<{ moduleId: string; number: number } | null>(null);
  const version = versionPick?.moduleId === moduleId ? versionPick.number : (mod?.current ?? 1);
  const versionRow = mod?.versions.find((v) => v.number === version);
  const preview = mod ? itemName(mod.name, version, kind) : "";
  const lane = cfg.kinds.find((k) => k.label === kind)?.lane ?? "";

  const [state, formAction] = useActionState(async (prev: ActionResult | null, fd: FormData): Promise<ActionResult> => {
    const res = await createAsset(prev, fd);
    if (!res.ok || !res.id) return res;
    for (const f of files) {
      const up = await uploadToAsset(res.id, f);
      if (!up.ok) return { ok: false, message: `Saved, but upload failed — ${up.message}. Retry from the item page.`, id: res.id };
    }
    if (fd.get("then") === "another") {
      setFiles([]);
    } else {
      router.push(`/assets/${res.id}`);
    }
    return res;
  }, null);

  if (!modules.length) return null;

  return (
    <div className="split" style={{ ["--side" as string]: "300px" }}>
      <Box className="pad-lg">
        <form action={formAction} className="form">
          <input type="hidden" name="discipline" value={discipline} />
          <input type="hidden" name="location" value={location} />
          <input type="hidden" name="status" value={status} />
          <input type="hidden" name="lane" value={lane ?? ""} />
          <input type="hidden" name="version_id" value={versionRow?.id ?? ""} />

          <div className="field">
            <label htmlFor="module_id">Module</label>
            <select id="module_id" name="module_id" className="input" value={moduleId} onChange={(e) => setModuleId(e.target.value)}>
              {modules.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.description}
                </option>
              ))}
            </select>
          </div>

          {mod && mod.versions.length > 1 && (
            <div className="field">
              <label htmlFor="version">Which version</label>
              <select
                id="version"
                className="input"
                value={version}
                onChange={(e) => setVersionPick({ moduleId, number: Number(e.target.value) })}
              >
                {[...mod.versions].reverse().map((v) => (
                  <option key={v.id} value={v.number}>
                    v{v.number} — {v.mechanism}{v.number === mod.current ? " (current)" : ""}
                  </option>
                ))}
              </select>
              <div className="hint">Filing something from an older mechanism? Pick its version so the history stays right.</div>
            </div>
          )}

          <div className="field">
            <label htmlFor="title">What is it?</label>
            <input id="title" name="title" className="input" placeholder="Claw finger, left side · CAN hub board · PID tuning run on the field" required />
          </div>

          <div className="field">
            <label htmlFor="kind">Kind</label>
            <select id="kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
              {cfg.kinds.map((k) => (
                <option key={k.label}>{k.label}</option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Its name</label>
            <div className="mono accent-text" style={{ fontSize: 15 }}>{preview}</div>
            <div className="hint">
              Set by the hub from the module, version and kind — nobody types names. A second {kind.toLowerCase()} in the same version gets a 2 on the end.
            </div>
          </div>

          <div className="field">
            <label>Where is it?</label>
            <div className="chips" style={{ marginBottom: 8 }}>
              {cfg.locations.map((l) => (
                <button key={l} type="button" className="btn chip" aria-pressed={location === l} onClick={() => setLocation(l)}>
                  {LOCATION_LABEL[l]}
                </button>
              ))}
            </div>
            {(location === "github" || location === "link") && (
              <input className="input" name="url" placeholder={LOCATION_PLACEHOLDER[location]} />
            )}
            {location === "drive" && (
              drives.length ? (
                <div className="row" style={{ flexWrap: "nowrap" }}>
                  <select name="drive_id" className="input" style={{ width: 150, flex: "none" }} defaultValue={drives[0].id}>
                    {drives.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                  <input className="input mono" name="path" placeholder={mod ? `/${mod.prefix.replace("-", "/")}/${mod.code}/${mod.name}-v${version}/` : LOCATION_PLACEHOLDER.drive} />
                </div>
              ) : (
                <div className="note-err">
                  No drives recorded yet — a lead records DRIVE-A and DRIVE-B on the <Link href="/mechanical#drives">Mechanical page</Link>.
                </div>
              )
            )}
            {location === "storage" && <FileDrop files={files} onChange={setFiles} hint={cfg.fileHint} accept={cfg.accept} />}
            {location === "drive" && (
              <div className="hint">Nothing uploads — this records where the master lives. Add the STEP and PDF exports on the next screen.</div>
            )}
          </div>

          <div className="field">
            <label>Status</label>
            <div className="seg">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="seg-opt"
                  aria-pressed={status === s}
                  disabled={s === "as_built" && !isLead}
                  title={s === "as_built" && !isLead ? "Only leads can mark as-built" : undefined}
                  onClick={() => setStatus(s)}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="hint">
              As-built means this is what is physically on the robot right now{isLead ? "." : " — a lead confirms that."}
            </div>
          </div>

          <div className="field">
            <label htmlFor="notes">Notes</label>
            <textarea id="notes" name="notes" className="input" rows={3} placeholder="What you tried, what failed, what the next batch should know." />
          </div>

          <div className="form-actions">
            <Submit primary name="then" value="open" pendingText={files.length ? "Uploading…" : "Saving…"}>
              Save item
            </Submit>
            <Submit name="then" value="another">
              Save and add another
            </Submit>
            <span style={{ marginLeft: "auto" }}>
              {state ? <Notice result={state} /> : <span className="text-muted small">Indexed under {mod?.prefix ?? "this season"}</span>}
            </span>
          </div>
        </form>
      </Box>

      <div className="stack" style={{ gap: 16 }}>
        <Box tint className="pad">
          <h5 style={{ margin: "0 0 8px" }}>How it&apos;s named</h5>
          <div className="mono" style={{ lineHeight: 1.7 }}>{preview || cfg.example}</div>
          <div className="text-muted small" style={{ marginTop: 8, lineHeight: 1.6 }}>
            season · robot · subsystem · module number · version · kind. The version is the mechanism: v1 might be a servo
            claw, v2 a suction cup. Start a new version on the module page when the mechanism changes.
          </div>
          {versionRow && (
            <div className="small" style={{ marginTop: 10 }}>
              <strong>v{versionRow.number}</strong> — {versionRow.mechanism}
            </div>
          )}
        </Box>
        {discipline === "mech" && (
          <Box className="pad">
            <h5 style={{ margin: "0 0 8px" }}>Before it can be as-built</h5>
            <div className="text-muted small" style={{ lineHeight: 1.6 }}>
              A STEP export and a PDF drawing must be attached. Native CAD may not open in five years; these will.
            </div>
          </Box>
        )}
        {discipline === "prog" && (
          <Box className="pad">
            <h5 style={{ margin: "0 0 8px" }}>Log the run, not just the result</h5>
            <div className="text-muted small" style={{ lineHeight: 1.6 }}>
              Next year&apos;s team can re-read your reasoning far more usefully than your final number.
            </div>
          </Box>
        )}
        {discipline === "elec" && (
          <Box className="pad">
            <h5 style={{ margin: "0 0 8px" }}>Keep the source in git</h5>
            <div className="text-muted small" style={{ lineHeight: 1.6 }}>
              A .kicad_sch is text. Push it, then paste the link here — real diffs, no “which version went to fab”.
            </div>
          </Box>
        )}
      </div>
    </div>
  );
}
