import Link from "next/link";
import { notFound } from "next/navigation";
import { addSubsystem, deleteSeason, setActiveSeason, updateSeason } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Empty, LinkCard, PageHead, PrimaryLink, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadCodes, loadDrives, loadMembers, loadSeason, memberMap } from "@/lib/data";
import { DISCIPLINE_LABEL, vscodeClone } from "@/lib/format";

export async function generateMetadata({ params }: PageProps<"/season/[year]">) {
  return { title: `Season ${(await params).year}` };
}

export default async function SeasonPage({ params }: PageProps<"/season/[year]">) {
  const { year } = await params;
  const { supabase, isLead } = await requireMember();
  const bundle = await loadSeason(supabase, Number(year));
  if (!bundle) notFound();

  const [codes, members, drives] = await Promise.all([loadCodes(supabase), loadMembers(supabase), loadDrives(supabase)]);
  const people = memberMap(members);
  const leads = members.filter((m) => m.role === "member" || m.role === "lead");
  const { season, robot, subsystems, modules, assets } = bundle;
  const unused = codes.filter((c) => !subsystems.some((s) => s.code === c.code));

  return (
    <main className="page">
      <div className="text-muted small" style={{ marginBottom: 6 }}>
        <Link href="/season">Seasons</Link> / {season.year}
      </div>
      <PageHead
        title={
          <>
            {robot?.codename ?? "Unnamed"} <span className="text-muted" style={{ fontWeight: 400, fontSize: "0.5em" }}>{season.prefix}</span>
          </>
        }
        actions={
          <>
            {season.is_active ? <Tag kind="accent">ACTIVE SEASON</Tag> : <Tag kind="neutral">PAST SEASON</Tag>}
            {season.result && <Tag>{season.result.toUpperCase()}</Tag>}
          </>
        }
      />
      <p className="text-muted lede" style={{ marginBottom: 32 }}>
        {robot?.description ? `${robot.description} ` : ""}
        Every subsystem below is owned by a named lead. Items marked as-built are what physically exists on the robot,
        which is not always the latest design.
      </p>

      <h3 style={{ margin: "0 0 16px" }}>Subsystems</h3>
      {subsystems.length ? (
        <div className="grid" style={{ ["--min" as string]: "240px", marginBottom: 12 }}>
          {subsystems.map((s) => {
            const items = assets.filter((a) => a.subsystem_code === s.code);
            const mods = modules.filter((m) => m.subsystem_id === s.id);
            const flagged = items.filter((a) => !a.name_ok || a.missing_exports).length;
            const disciplines = [...new Set(items.map((a) => a.discipline))];
            return (
              <LinkCard key={s.id} href={`/season/${season.year}/${s.code}`}>
                <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                  <div className="mono accent-text">{season.prefix}-{s.code}</div>
                  <div className="text-muted small">{mods.length} modules · {items.length} items</div>
                </div>
                <div className="card-title">{s.name}</div>
                <div className="text-muted small">lead: {s.lead_id ? displayName(people.get(s.lead_id)) : <span className="note-err">none</span>}</div>
                <div className="row" style={{ gap: 6 }}>
                  {disciplines.map((d) => (
                    <Tag key={d} kind="neutral">{DISCIPLINE_LABEL[d].toUpperCase()}</Tag>
                  ))}
                  {flagged > 0 && <Tag kind="warn">{flagged} FLAGGED</Tag>}
                </div>
              </LinkCard>
            );
          })}
        </div>
      ) : (
        <Empty
          title="No subsystems yet"
          body="Subsystems come before modules. Add the ones this robot has — drivetrain, gripper, power…"
        />
      )}

      {isLead && robot && unused.length > 0 && (
        <ActionForm action={addSubsystem} className="inline-form" style={{ marginTop: 16 }}>
          <input type="hidden" name="robot_id" value={robot.id} />
          <select name="code" className="input" required>
            {unused.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.name}
              </option>
            ))}
          </select>
          <select name="lead_id" className="input" defaultValue="">
            <option value="">lead: assign later</option>
            {leads.map((m) => (
              <option key={m.id} value={m.id}>
                lead: {displayName(m)}
              </option>
            ))}
          </select>
          <Submit>Add subsystem</Submit>
          <FormNotice />
          <Link href="/season/new" className="small">Need a new code?</Link>
        </ActionForm>
      )}

      <div className="split section">
        <div>
          <h3 style={{ margin: "0 0 16px" }}>Where this robot lives</h3>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Location</th>
                  <th>Reference</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Code, schematics, PCB, exports</td>
                  <td>GitHub — club org</td>
                  <td>
                    {season.repo ? (
                      <>
                        <a href={`https://github.com/${season.repo}`} target="_blank" rel="noreferrer" className="mono">{season.repo}</a>
                        {" · "}
                        <a href={vscodeClone(season.repo)}>open in VS Code</a>
                      </>
                    ) : (
                      <span className="note-err">not set</span>
                    )}
                  </td>
                </tr>
                <tr>
                  <td>CAD masters</td>
                  <td>{drives.length ? drives.map((d) => d.label).join(" / ") : <span className="note-err">no drives recorded</span>}</td>
                  <td className="mono">/{season.prefix}/&lt;CODE&gt;/&lt;PART&gt;/</td>
                </tr>
                <tr>
                  <td>STEP + PDF exports</td>
                  <td>Hub storage</td>
                  <td className="text-muted small">attached to each CAD master</td>
                </tr>
                <tr>
                  <td>Modules</td>
                  <td>One folder each</td>
                  <td className="mono">modules/&lt;module&gt;/</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {isLead && robot && (
          <Box className="pad">
            <h5 style={{ margin: "0 0 12px" }}>Season details</h5>
            <ActionForm action={updateSeason} className="form" style={{ gap: 12 }}>
              <input type="hidden" name="season_id" value={season.id} />
              <div className="field">
                <label>Codename</label>
                <input name="codename" className="input" defaultValue={robot.codename} required />
              </div>
              <div className="field">
                <label>Description</label>
                <input name="description" className="input" defaultValue={robot.description ?? ""} />
              </div>
              <div className="field">
                <label>GitHub repo (owner/name)</label>
                <input name="repo" className="input mono" defaultValue={season.repo ?? ""} placeholder={`rec-robocon2026/rc${String(season.year).slice(-2)}-robot`} />
              </div>
              <div className="field">
                <label>Result</label>
                <input name="result" className="input" defaultValue={season.result ?? ""} placeholder="e.g. 2nd place" />
              </div>
              <div className="row">
                <Submit>Save</Submit>
                <FormNotice />
              </div>
            </ActionForm>
            {!season.is_active && (
              <form action={setActiveSeason} style={{ marginTop: 12 }}>
                <input type="hidden" name="season_id" value={season.id} />
                <button className="btn btn-ghost" type="submit">Make this the active season</button>
              </form>
            )}
            <details style={{ marginTop: 16 }}>
              <summary className="text-muted small" style={{ cursor: "pointer" }}>Delete this season</summary>
              <form action={deleteSeason} className="inline-form" style={{ marginTop: 8 }}>
                <input type="hidden" name="season_id" value={season.id} />
                <input name="confirm" className="input" placeholder="type DELETE" required />
                <button className="btn btn-secondary" type="submit">Delete season and everything in it</button>
              </form>
            </details>
          </Box>
        )}
        {!isLead && season.is_active && subsystems.length > 0 && modules.length === 0 && (
          <Box tint className="pad">
            <h5 style={{ margin: "0 0 6px" }}>Next: modules</h5>
            <p className="small" style={{ margin: "0 0 12px" }}>Subsystems are in. Declare the first module so each department has somewhere to put their files.</p>
            <PrimaryLink href="/modules/new">New module</PrimaryLink>
          </Box>
        )}
      </div>
    </main>
  );
}
