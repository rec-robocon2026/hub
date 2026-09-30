import type { Metadata } from "next";
import Link from "next/link";
import { deleteDrive, saveDrive } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { AddSection } from "@/components/add-section";
import { AssetFlags, Box, Code, Empty, PageHead, StatusTag, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadDrives, loadMembers, loadSeason, memberMap } from "@/lib/data";
import { shortDate } from "@/lib/format";
import type { Drive, Member } from "@/lib/types";

export const metadata: Metadata = { title: "Mechanical" };

export default async function MechanicalPage({ searchParams }: PageProps<"/mechanical">) {
  const { module } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const [bundle, drives, members] = await Promise.all([loadSeason(supabase), loadDrives(supabase), loadMembers(supabase)]);
  const people = memberMap(members);
  const approved = members.filter((m) => m.role === "member" || m.role === "lead");
  const leads = members.filter((m) => m.role === "lead" && m.department === "mech");
  const parts = bundle?.assets.filter((a) => a.discipline === "mech") ?? [];
  const builtNoExports = parts.filter((a) => a.status === "as_built" && a.missing_exports);
  const driveLabel = new Map(drives.map((d) => [d.id, d.label]));
  const sample = parts.find((a) => a.has_step)?.name ?? `${bundle?.season.prefix ?? "RC26"}-R1-DRV-MOTORMNT-v2`;

  return (
    <main className="page">
      <PageHead
        kicker="Department"
        title="Mechanical"
        sub={`lead: ${leads.length ? leads.map(displayName).join(", ") : "not set"} · CAD, frame, drivetrain, gripper`}
      />
      <p className="lede" style={{ marginTop: -16, marginBottom: 40 }}>
        A SolidWorks assembly is 50 to 500 MB and binary, so the master stays on a labelled club drive. The hub holds the
        record of where it is and the two small files that survive: the STEP and the PDF drawing.
      </p>

      <div className="grid" style={{ ["--min" as string]: "260px", marginBottom: 48 }}>
        <Box className="pad">
          <div className="num">01</div>
          <h5 style={{ margin: "0 0 4px" }}>Register the master</h5>
          <div className="text-muted small" style={{ lineHeight: 1.55 }}>Pick the drive and type the folder. Nothing uploads — the hub just records where the .sldasm lives.</div>
        </Box>
        <Box className="pad">
          <div className="num">02</div>
          <h5 style={{ margin: "0 0 4px" }}>Upload the STEP and the drawing</h5>
          <div className="text-muted small" style={{ lineHeight: 1.55 }}>Export them while the part is open in front of you, then drop them on the part&apos;s page. Up to 50 MB each.</div>
        </Box>
        <Box tint className="pad">
          <div className="num">03</div>
          <h5 style={{ margin: "0 0 4px" }}>Mark as-built</h5>
          <div className="text-muted small" style={{ lineHeight: 1.55 }}>The latest CAD is often not the part on the robot. A lead confirms what was actually machined.</div>
        </Box>
      </div>

      <section id="parts">
        <h3 style={{ margin: "0 0 6px" }}>Parts this season</h3>
        <p className="text-muted section-intro">Design and as-built side by side on purpose — the difference between them is the thing that gets lost.</p>
        {parts.length ? (
          <>
            <div className="table-wrap" style={{ marginBottom: 20 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Part</th>
                    <th>Status</th>
                    <th>Master</th>
                    <th>Exports</th>
                    <th>Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {parts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/assets/${a.id}`} className="mono">{a.name}</Link>
                        <div className="text-muted small">{a.title ?? a.kind} · {a.module_name}</div>
                        <div className="flags"><AssetFlags asset={a} /></div>
                      </td>
                      <td><StatusTag status={a.status} /></td>
                      <td className="small">{a.location === "drive" ? <span className="mono">{driveLabel.get(a.drive_id ?? "") ?? "?"} {a.path}</span> : "Hub storage"}</td>
                      <td className="small">
                        {a.location === "drive" ? (
                          <Link href={`/assets/${a.id}#exports`}>{[a.has_step && "STEP", a.has_pdf && "PDF"].filter(Boolean).join(" + ") || "none — upload"}</Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="text-muted small">{a.revision ? `v${a.revision}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {builtNoExports.length > 0 && (
              <Box tint className="pad" style={{ marginBottom: 48 }}>
                <div className="small" style={{ lineHeight: 1.6 }}>
                  <strong>{builtNoExports.length} as-built {builtNoExports.length === 1 ? "part has" : "parts have"} no STEP + PDF.</strong>{" "}
                  Those are the ones that will be unreadable in five years — clear them before the season closes.
                </div>
              </Box>
            )}
          </>
        ) : (
          <div style={{ marginBottom: 48 }}>
            <Empty title="No parts registered yet" body="Register the first CAD master below — it takes under a minute." action={<a className="btn btn-secondary" href="#add">Register a master</a>} />
          </div>
        )}
      </section>

      <div className="split" style={{ marginBottom: 8 }}>
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Your export feeds the simulation</h3>
          <p className="text-muted section-intro">
            The same STEP the archive wants is the file Gazebo needs. It gets converted into a visual mesh and a decimated
            collision mesh and wired into the URDF — so the export is not paperwork, it is what lets programming test
            against your part. Record the meshes on the part as a Simulation mesh.
          </p>
          <Code label="convert a STEP export into Gazebo meshes">{`./scripts/step2mesh.sh ${sample}.step

# writes sim/meshes/${sample.toLowerCase().replace(/-/g, "_")}.dae      (visual)
#        sim/meshes/${sample.toLowerCase().replace(/-/g, "_")}_col.stl  (collision, decimated)`}</Code>
        </div>

        <section id="drives" className="stack" style={{ gap: 14 }}>
          <h3 style={{ margin: 0 }}>Drives</h3>
          {drives.length === 0 && (
            <Empty title="No drives recorded" body={isLead ? "Record the two CAD drives and who keeps each one." : "A lead records the two CAD drives and their custodians."} />
          )}
          {drives.map((d) => (
            <DriveCard key={d.id} drive={d} isLead={isLead} members={approved} custodian={d.custodian_id ? displayName(people.get(d.custodian_id)) : null} />
          ))}
          {isLead && drives.length < 4 && (
            <Box className="pad">
              <h5 style={{ margin: "0 0 10px" }}>Record a drive</h5>
              <DriveForm members={approved} />
            </Box>
          )}
          <Box className="pad">
            <h5 style={{ margin: "0 0 8px" }}>Folder rule</h5>
            <div className="mono">/{bundle?.season.prefix ?? "RC26"}/R1/DRV/WHEELMOD/</div>
            <div className="text-muted small" style={{ marginTop: 8, lineHeight: 1.6 }}>
              Folders mirror the naming convention, so a record&apos;s path is enough to find the file without asking anyone.
            </div>
          </Box>
        </section>
      </div>

      <AddSection
        discipline="mech"
        bundle={bundle}
        drives={drives}
        isLead={isLead}
        moduleId={typeof module === "string" ? module : undefined}
        intro="Register a master on the drive, then upload its STEP and PDF on the next screen. Photos and jigs can go straight into hub storage."
      />
    </main>
  );
}

function DriveCard({ drive, isLead, members, custodian }: { drive: Drive; isLead: boolean; members: Member[]; custodian: string | null }) {
  return (
    <Box className="gap-item">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <div className="mono" style={{ fontSize: 13 }}>{drive.label}</div>
          <div className="text-muted small">custodian: {custodian ?? <span className="note-err">none</span>}</div>
        </div>
        <Tag kind={drive.last_mirrored_at ? "accent" : "warn"}>
          {drive.last_mirrored_at ? `MIRRORED ${shortDate(drive.last_mirrored_at).toUpperCase()}` : "NEVER MIRRORED"}
        </Tag>
      </div>
      {drive.notes && <div className="text-muted small" style={{ marginTop: 6 }}>{drive.notes}</div>}
      {isLead && (
        <details style={{ marginTop: 8 }}>
          <summary className="small" style={{ cursor: "pointer" }}>Edit</summary>
          <div style={{ marginTop: 10 }}>
            <DriveForm drive={drive} members={members} />
            <form action={deleteDrive} style={{ marginTop: 8 }}>
              <input type="hidden" name="drive_id" value={drive.id} />
              <button className="btn btn-ghost" type="submit" style={{ fontSize: 12 }}>Delete {drive.label}</button>
            </form>
          </div>
        </details>
      )}
    </Box>
  );
}

function DriveForm({ drive, members }: { drive?: Drive; members: Member[] }) {
  return (
    <ActionForm action={saveDrive} className="form" style={{ gap: 10 }}>
      {drive && <input type="hidden" name="drive_id" value={drive.id} />}
      <input name="label" className="input mono" placeholder="DRIVE-A" defaultValue={drive?.label} required />
      <select name="custodian_id" className="input" defaultValue={drive?.custodian_id ?? ""}>
        <option value="">custodian: none</option>
        {members.map((m) => (
          <option key={m.id} value={m.id}>custodian: {displayName(m)}</option>
        ))}
      </select>
      <div className="field">
        <label>Last mirrored</label>
        <input name="last_mirrored_at" type="date" className="input" defaultValue={drive?.last_mirrored_at ?? ""} />
      </div>
      <input name="notes" className="input" placeholder="Where it's kept, e.g. lab cabinet 2" defaultValue={drive?.notes ?? ""} />
      <div className="row">
        <Submit>{drive ? "Save" : "Record drive"}</Submit>
        <FormNotice />
      </div>
    </ActionForm>
  );
}
