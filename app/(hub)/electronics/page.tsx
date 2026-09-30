import type { Metadata } from "next";
import Link from "next/link";
import { AddSection } from "@/components/add-section";
import { AssetFlags, Box, Code, Empty, PageHead, StatusTag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadDrives, loadMembers, loadSeason } from "@/lib/data";
import { timeAgo } from "@/lib/format";

export const metadata: Metadata = { title: "Electronics" };

export default async function ElectronicsPage({ searchParams }: PageProps<"/electronics">) {
  const { module } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const [bundle, drives, members] = await Promise.all([loadSeason(supabase), loadDrives(supabase), loadMembers(supabase)]);
  const leads = members.filter((m) => m.role === "lead" && m.department === "elec");
  const elec = bundle?.assets.filter((a) => a.discipline === "elec") ?? [];

  const boards = (bundle?.modules ?? [])
    .filter((m) => m.lanes.includes("SCH") || m.lanes.includes("PCB") || elec.some((a) => a.module_id === m.id))
    .map((m) => {
      const mine = elec.filter((a) => a.module_id === m.id);
      const rev = (lane: string) => {
        const revs = mine.filter((a) => a.lane === lane && a.revision).map((a) => a.revision as number);
        return revs.length ? `v${Math.max(...revs)}` : "—";
      };
      const release = mine.filter((a) => a.kind === "Gerber release").sort((a, b) => (b.revision ?? 0) - (a.revision ?? 0))[0];
      return { m, sch: rev("SCH"), pcb: rev("PCB"), release };
    });

  const kicadExample = boards[0]?.m.slug ?? "can-hub";

  return (
    <main className="page">
      <PageHead
        kicker="Department"
        title="Electronics"
        sub={`lead: ${leads.length ? leads.map(displayName).join(", ") : "not set"} · schematics, PCB, power`}
      />
      <p className="lede" style={{ marginTop: -16, marginBottom: 40 }}>
        KiCad sources are text files a few MB in size, so they live in the season repo next to the firmware that runs on
        them — one folder per module, properly versioned, with real diffs. The hub records each board&apos;s revisions and
        where its release files are.
      </p>

      <h3 style={{ margin: "0 0 16px" }}>Boards this season</h3>
      {boards.length ? (
        <div className="table-wrap" style={{ marginBottom: 48 }}>
          <table className="table">
            <thead>
              <tr>
                <th>Module</th>
                <th>Schematic</th>
                <th>PCB</th>
                <th>Release</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {boards.map(({ m, sch, pcb, release }) => (
                <tr key={m.id}>
                  <td>
                    <Link href={`/modules/${m.id}`}>{m.name}</Link>
                    <div className="text-muted mono" style={{ fontSize: 11.5 }}>modules/{m.slug}/hardware/</div>
                  </td>
                  <td className="text-muted small">{sch}</td>
                  <td className="text-muted small">{pcb}</td>
                  <td className="small">
                    {release ? <Link className="mono" href={`/assets/${release.id}`}>{release.name}</Link> : <span className="note-err">not released yet</span>}
                  </td>
                  <td><StatusTag status={m.status} /></td>
                  <td>
                    {bundle?.season.repo && (
                      <a className="small" style={{ whiteSpace: "nowrap" }} href={`https://github.com/${bundle.season.repo}/tree/main/modules/${m.slug}/hardware`} target="_blank" rel="noreferrer">
                        Open on GitHub
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ marginBottom: 48 }}>
          <Empty
            title="No boards yet"
            body="A module with the SCH or PCB lane shows up here. Declare the board as a module, then link its schematic."
            action={bundle?.season.is_active && bundle.subsystems.length ? <Link className="btn btn-secondary" href="/modules/new">New module</Link> : undefined}
          />
        </div>
      )}

      <div className="split">
        <div>
          <h3 style={{ margin: "0 0 6px" }}>Before every fab order</h3>
          <p className="text-muted section-intro">
            Export the release files and commit them. The PDF and the Gerbers are what the next batch reads — the KiCad
            source is for you, the release is for everyone else.
          </p>
          <Code label="modules/*/hardware/README.md">{`cd modules/${kicadExample}/hardware
kicad-cli sch export pdf ${kicadExample}.kicad_sch -o release/
kicad-cli pcb export gerbers ${kicadExample}.kicad_pcb -o release/gerbers/
zip -r release/gerbers-v2.zip release/gerbers/`}</Code>
        </div>
        <Box className="pad" style={{ alignSelf: "start" }}>
          <h5 style={{ margin: "0 0 10px" }}>Fab-order checklist</h5>
          <div className="stack small" style={{ gap: 7, lineHeight: 1.5 }}>
            <div>Schematic PDF exported and committed</div>
            <div>Gerbers zipped with the revision in the filename</div>
            <div>BOM exported, part numbers not just values</div>
            <div>Release recorded here as a Gerber release</div>
            <div>Board marked as-built once populated and tested (lead)</div>
            <div>Firmware pin map checked against the new revision</div>
          </div>
        </Box>
      </div>

      <h3 className="section" style={{ margin: "44px 0 16px" }}>Electronics items this season</h3>
      {elec.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Module</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {elec.map((a) => (
                <tr key={a.id}>
                  <td>
                    <Link href={`/assets/${a.id}`} className="mono">{a.name}</Link>
                    <div className="text-muted small">{a.title}</div>
                    <div className="flags"><AssetFlags asset={a} /></div>
                  </td>
                  <td className="text-muted small">{a.kind}</td>
                  <td className="small"><Link href={`/modules/${a.module_id}`}>{a.module_name}</Link></td>
                  <td><StatusTag status={a.status} /></td>
                  <td className="text-muted small">{timeAgo(a.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted small">Nothing yet. Push the KiCad source, then link it below.</p>
      )}

      <AddSection
        discipline="elec"
        bundle={bundle}
        drives={drives}
        isLead={isLead}
        moduleId={typeof module === "string" ? module : undefined}
        intro="Push the KiCad source and paste the link. Release artefacts — Gerber zip, schematic PDF, BOM — can be dropped straight in."
      />
    </main>
  );
}
