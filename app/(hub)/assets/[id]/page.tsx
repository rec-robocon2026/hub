import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAsset, deleteFile, setAssetStatus, updateAsset } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { AssetFlags, Box, PageHead, StatusTag, Tag } from "@/components/ui";
import { UploadExports } from "@/components/upload-exports";
import { displayName, requireMember } from "@/lib/auth";
import { loadDrives, loadMembers, memberMap } from "@/lib/data";
import { DISCIPLINES, LOCATION_LABEL } from "@/lib/disciplines";
import { DISCIPLINE_LABEL, fileSize, shortDate, STATUS_LABEL, timeAgo } from "@/lib/format";
import type { AssetFile, AssetHealth, ModuleVersion } from "@/lib/types";
import { STATUSES } from "@/lib/types";

export default async function AssetPage({ params }: PageProps<"/assets/[id]">) {
  const { id } = await params;
  const { supabase, isLead } = await requireMember();
  const { data } = await supabase.from("asset_health").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const a = data as AssetHealth;

  const [{ data: fileRows }, drives, members, events, { data: versionRows }] = await Promise.all([
    supabase.from("asset_files").select("*").eq("asset_id", id).order("created_at", { ascending: false }),
    loadDrives(supabase),
    loadMembers(supabase),
    supabase.from("events").select("*").eq("asset_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("module_versions").select("*").eq("module_id", a.module_id).order("number"),
  ]);
  const versions = (versionRows as ModuleVersion[] | null) ?? [];
  const files = (fileRows as AssetFile[] | null) ?? [];
  const people = memberMap(members);
  const drive = drives.find((d) => d.id === a.drive_id);
  const cfg = DISCIPLINES[a.discipline];
  const isMaster = a.location === "drive";

  return (
    <main className="page">
      <div className="text-muted small" style={{ marginBottom: 6 }}>
        <Link href={`/season/${a.season_year}`}>{a.season_prefix}</Link> / {a.robot_code} /{" "}
        <Link href={`/season/${a.season_year}/${a.robot_code}/${a.subsystem_code}`}>{a.subsystem_code}</Link> /{" "}
        <Link href={`/modules/${a.module_id}`}>{a.module_name}</Link>
        {a.module_description ? <> · {a.module_description}</> : null}
      </div>
      <PageHead
        kicker={`${DISCIPLINE_LABEL[a.discipline]} · ${a.kind}${a.version_number ? ` · v${a.version_number}${a.version_number === a.module_current_version ? " (current)" : " (older version)"}` : ""}`}
        title={<span className="mono" style={{ fontSize: "0.7em", letterSpacing: 0 }}>{a.name}</span>}
        sub={a.title ?? undefined}
        actions={
          <>
            <StatusTag status={a.status} />
            {a.lane && <Tag>{a.lane}</Tag>}
            <AssetFlags asset={a} />
          </>
        }
      />

      <div className="split" style={{ ["--side" as string]: "340px" }}>
        <div className="stack" style={{ gap: 28 }}>
          {a.version_mechanism && (
            <Box tint className="pad">
              <h5 style={{ margin: "0 0 6px" }}>Version {a.version_number}</h5>
              <div className="small">{a.version_mechanism}</div>
            </Box>
          )}

          <div>
            <h4 style={{ margin: "0 0 12px" }}>Where it is</h4>
            <div className="table-wrap">
              <table className="table">
                <tbody>
                  <tr>
                    <td className="text-muted" style={{ width: 140 }}>Location</td>
                    <td>{LOCATION_LABEL[a.location]}</td>
                  </tr>
                  {isMaster && (
                    <tr>
                      <td className="text-muted">Master</td>
                      <td className="mono">{drive?.label ?? "unknown drive"} {a.path ?? <span className="note-err">no folder recorded</span>}</td>
                    </tr>
                  )}
                  {a.url && (
                    <tr>
                      <td className="text-muted">Link</td>
                      <td><a href={a.url} target="_blank" rel="noreferrer" style={{ wordBreak: "break-all" }}>{a.url}</a></td>
                    </tr>
                  )}
                  <tr>
                    <td className="text-muted">Revision</td>
                    <td>{a.revision ? `v${a.revision}` : "—"}</td>
                  </tr>
                  <tr>
                    <td className="text-muted">Added</td>
                    <td>{displayName(people.get(a.created_by ?? ""))} · {shortDate(a.created_at)}</td>
                  </tr>
                  {a.built_at && (
                    <tr>
                      <td className="text-muted">As-built</td>
                      <td>confirmed by {displayName(people.get(a.built_by ?? ""))} · {shortDate(a.built_at)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {a.notes && <p style={{ marginTop: 14, whiteSpace: "pre-wrap" }}>{a.notes}</p>}
          </div>

          <div id="exports">
            <h4 style={{ margin: "0 0 6px" }}>{isMaster ? "Exports" : "Files"}</h4>
            {isMaster && (
              <p className="text-muted small">
                The STEP and the PDF drawing are what survive — native CAD may not open in five years. The STEP is also
                what gets converted into Gazebo meshes for simulation.
              </p>
            )}
            {isMaster && (
              <div className="row" style={{ marginBottom: 12 }}>
                <Tag kind={a.has_step ? "accent" : "warn"}>{a.has_step ? "✓ STEP" : "STEP MISSING"}</Tag>
                <Tag kind={a.has_pdf ? "accent" : "warn"}>{a.has_pdf ? "✓ PDF DRAWING" : "PDF MISSING"}</Tag>
              </div>
            )}
            {files.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                {files.map((f) => (
                  <div key={f.id} className="file-row">
                    <span className="row">
                      <Tag kind="neutral">{f.kind.toUpperCase()}</Tag>
                      <a href={`/files/${f.id}`} className="mono">{f.file_name}</a>
                    </span>
                    <span className="row text-muted">
                      {fileSize(f.size_bytes)} · {displayName(people.get(f.uploaded_by ?? ""))} · {shortDate(f.created_at)}
                      {isLead && (
                        <form action={deleteFile}>
                          <input type="hidden" name="file_id" value={f.id} />
                          <button className="btn btn-ghost" type="submit" style={{ fontSize: 12 }}>Delete</button>
                        </form>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <UploadExports assetId={a.id} hint={cfg.fileHint} accept={cfg.accept} />
          </div>

          <div>
            <h4 style={{ margin: "0 0 12px" }}>History</h4>
            {(events.data ?? []).map((e) => (
              <div key={e.id} className="history-row">
                <div className="lane-col">{e.lane ?? "·"}</div>
                <div>
                  <div style={{ fontSize: 13.5 }}>{e.action}{e.detail && e.detail !== a.name ? ` — ${e.detail}` : ""}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {e.actor_name ?? displayName(people.get(e.actor_id ?? ""))} · {timeAgo(e.created_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="stack" style={{ gap: 20 }}>
          <Box className="pad">
            <h5 style={{ margin: "0 0 10px" }}>Status</h5>
            <ActionForm action={setAssetStatus} className="form" style={{ gap: 10 }}>
              <input type="hidden" name="asset_id" value={a.id} />
              <div className="seg">
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    type="submit"
                    name="status"
                    value={s}
                    className="seg-opt"
                    aria-pressed={a.status === s}
                    disabled={(s === "as_built" && !isLead) || a.status === s}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <FormNotice />
            </ActionForm>
            <div className="hint">
              {isLead
                ? isMaster && (!a.has_step || !a.has_pdf)
                  ? "Heads-up: upload the STEP and PDF before marking as-built, or it stays flagged."
                  : "As-built means this revision is what's physically on the robot."
                : "Only leads mark as-built. Ask yours once it's machined or populated and tested."}
            </div>
          </Box>

          <Box className="pad">
            <h5 style={{ margin: "0 0 10px" }}>Edit</h5>
            <ActionForm action={updateAsset} className="form" style={{ gap: 10 }}>
              <input type="hidden" name="asset_id" value={a.id} />
              <div className="field">
                <label>What is it?</label>
                <input name="title" className="input" defaultValue={a.title ?? ""} required />
              </div>
              {versions.length > 1 && (
                <div className="field">
                  <label>Version</label>
                  <select name="version_id" className="input" defaultValue={a.version_id ?? ""}>
                    {[...versions].reverse().map((v) => (
                      <option key={v.id} value={v.id}>v{v.number} — {v.mechanism}</option>
                    ))}
                  </select>
                  <div className="hint">Filed under the wrong mechanism? Moving it renames it to match.</div>
                </div>
              )}
              {isMaster ? (
                <>
                  <div className="field">
                    <label>Drive</label>
                    <select name="drive_id" className="input" defaultValue={a.drive_id ?? ""}>
                      {drives.map((d) => (
                        <option key={d.id} value={d.id}>{d.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label>Folder on the drive</label>
                    <input name="path" className="input mono" defaultValue={a.path ?? ""} />
                  </div>
                </>
              ) : (
                <>
                  <input type="hidden" name="drive_id" value={a.drive_id ?? ""} />
                  <input type="hidden" name="path" value={a.path ?? ""} />
                </>
              )}
              {(a.location === "github" || a.location === "link") ? (
                <div className="field">
                  <label>Link</label>
                  <input name="url" className="input" defaultValue={a.url ?? ""} />
                </div>
              ) : (
                <input type="hidden" name="url" value={a.url ?? ""} />
              )}
              <div className="field">
                <label>Notes</label>
                <textarea name="notes" className="input" rows={3} defaultValue={a.notes ?? ""} />
              </div>
              <div className="row">
                <Submit>Save</Submit>
                <FormNotice />
              </div>
            </ActionForm>
          </Box>

          {isLead && (
            <details>
              <summary className="text-muted small" style={{ cursor: "pointer" }}>Delete item</summary>
              <form action={deleteAsset} style={{ marginTop: 8 }}>
                <input type="hidden" name="asset_id" value={a.id} />
                <input type="hidden" name="module_id" value={a.module_id} />
                <button className="btn btn-secondary" type="submit">Delete {a.name}{files.length ? ` and ${files.length} files` : ""}</button>
              </form>
            </details>
          )}
        </div>
      </div>
    </main>
  );
}
