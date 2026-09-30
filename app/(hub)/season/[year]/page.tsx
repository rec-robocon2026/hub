import Link from "next/link";
import { notFound } from "next/navigation";
import { addRobot, addSubsystem, deleteRobot, deleteSeason, setActiveSeason, syncSeasonToGithub, updateRobot, updateSeason } from "@/app/(hub)/actions";
import { GithubNotice } from "@/components/github-notice";
import { githubOrg, isGithubConfigured } from "@/lib/github-api";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Empty, LinkCard, PageHead, PrimaryLink, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadCodes, loadDrives, loadMembers, loadSeason, memberMap, robotPrefix } from "@/lib/data";
import { DISCIPLINE_LABEL, vscodeClone } from "@/lib/format";
import type { Member, Robot, SubsystemCode } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/season/[year]">) {
  return { title: `Season ${(await params).year}` };
}

export default async function SeasonPage({ params, searchParams }: PageProps<"/season/[year]">) {
  const { year } = await params;
  const { gh, ghok } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const bundle = await loadSeason(supabase, Number(year));
  if (!bundle) notFound();

  const [codes, members, drives] = await Promise.all([loadCodes(supabase), loadMembers(supabase), loadDrives(supabase)]);
  const people = memberMap(members);
  const approved = members.filter((m) => m.role === "member" || m.role === "lead");
  const { season, robots, subsystems, modules, assets } = bundle;
  const competition = robots.filter((r) => r.kind === "competition");
  const freeCodes = Array.from({ length: 9 }, (_, i) => `R${i + 1}`).filter((c) => !robots.some((r) => r.code === c));
  const nextCodes = [...freeCodes.slice(0, 1), ...(robots.some((r) => r.code === "RD") ? [] : ["RD"])];

  return (
    <main className="page">
      <div className="text-muted small" style={{ marginBottom: 6 }}>
        <Link href="/season">Seasons</Link> / {season.year}
      </div>
      <PageHead
        kicker={`Season ${season.year}`}
        title={
          <>
            {competition.map((r) => r.codename).join(" · ") || "No robots yet"}{" "}
            <span className="text-muted" style={{ fontWeight: 400, fontSize: "0.5em" }}>{season.prefix}</span>
          </>
        }
        actions={
          <>
            {season.is_active ? <Tag kind="accent">ACTIVE SEASON</Tag> : <Tag kind="neutral">PAST SEASON</Tag>}
            {season.result && <Tag>{season.result.toUpperCase()}</Tag>}
          </>
        }
      />
      <GithubNotice gh={gh} ghok={ghok} />
      <p className="text-muted lede" style={{ marginBottom: 32 }}>
        Each robot has its own subsystems, each owned by a named lead. The R&amp;D bench holds experiments — proven work
        gets socketed onto a robot. Items marked as-built are what physically exists, which is not always the latest design.
      </p>

      {robots.length === 0 && (
        <Empty title="No robots in this season" body="Add the competition robots (R1, R2 …) and the R&D bench below." />
      )}

      {robots.map((robot) => {
        const subs = subsystems.filter((s) => s.robot_id === robot.id);
        const used = new Set(subs.map((s) => s.code));
        const robotModules = modules.filter((m) => subs.some((s) => s.id === m.subsystem_id));
        return (
          <section key={robot.id} className="section" style={{ marginTop: 36 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
              <div>
                <div className="mono accent-text">{robotPrefix(season, robot)}</div>
                <h2 style={{ margin: 0 }}>
                  {robot.codename} {robot.kind === "rnd" && <Tag>R&amp;D BENCH</Tag>}
                </h2>
                {robot.description && <div className="text-muted small">{robot.description}</div>}
              </div>
              <div className="text-muted small">
                {subs.length} subsystems · {robotModules.length} modules · {assets.filter((a) => a.robot_id === robot.id).length} items
              </div>
            </div>

            {subs.length ? (
              <div className="grid" style={{ ["--min" as string]: "240px" }}>
                {subs.map((s) => {
                  const items = assets.filter((a) => a.robot_id === robot.id && a.subsystem_code === s.code);
                  const mods = modules.filter((m) => m.subsystem_id === s.id);
                  const flagged = items.filter((a) => !a.name_ok || a.missing_exports).length;
                  const disciplines = [...new Set(items.map((a) => a.discipline))];
                  return (
                    <LinkCard key={s.id} href={`/season/${season.year}/${robot.code}/${s.code}`}>
                      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                        <div className="mono accent-text">{robotPrefix(season, robot)}-{s.code}</div>
                        <div className="text-muted small">{mods.length} modules · {items.length} items</div>
                      </div>
                      <div className="card-title">{s.name}</div>
                      <div className="text-muted small">
                        lead: {s.lead_id ? displayName(people.get(s.lead_id)) : robot.kind === "rnd" ? "—" : <span className="note-err">none</span>}
                      </div>
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
              <Empty title={`${robot.code} has no subsystems yet`} body="Subsystems come before modules — drivetrain, gripper, power…" />
            )}

            {isLead && (
              <RobotAdmin robot={robot} codes={codes.filter((c) => !used.has(c.code))} members={approved} canDelete={robotModules.length === 0} />
            )}
          </section>
        );
      })}

      {isLead && nextCodes.length > 0 && (
        <Box className="pad section" style={{ maxWidth: 720 }}>
          <h5 style={{ margin: "0 0 10px" }}>Add a robot</h5>
          <ActionForm action={addRobot} className="form" style={{ gap: 10 }}>
            <input type="hidden" name="season_id" value={season.id} />
            <div className="inline-form">
              <select name="code" className="input" defaultValue={nextCodes[0]}>
                {nextCodes.map((c) => (
                  <option key={c} value={c}>{c === "RD" ? "RD — R&D bench" : c}</option>
                ))}
              </select>
              <input name="codename" className="input" placeholder="codename" required />
              <input name="description" className="input" placeholder="one line about it" style={{ flex: 1 }} />
            </div>
            <div className="chips">
              {codes.map((c) => (
                <label key={c.code} className="check small">
                  <input type="checkbox" name="codes" value={c.code} defaultChecked /> {c.code}
                </label>
              ))}
            </div>
            <div className="row">
              <Submit>Add robot</Submit>
              <FormNotice />
            </div>
          </ActionForm>
        </Box>
      )}

      <div className="split section">
        <div>
          <h3 style={{ margin: "0 0 16px" }}>Where this season lives</h3>
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
                  <td>Code, schematics, PCB</td>
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
                  <td>Modules</td>
                  <td>One folder each, per robot</td>
                  <td className="mono">{robots.map((r) => `${r.code}/`).join("  ") || "R1/"}&lt;module&gt;/</td>
                </tr>
                <tr>
                  <td>CAD masters</td>
                  <td>{drives.length ? drives.map((d) => d.label).join(" / ") : <span className="note-err">no drives recorded</span>}</td>
                  <td className="mono">/{season.prefix}/R1/&lt;CODE&gt;/&lt;PART&gt;/</td>
                </tr>
                <tr>
                  <td>STEP + PDF exports</td>
                  <td>Hub storage</td>
                  <td className="text-muted small">attached to each CAD master</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {isLead ? (
          <Box className="pad">
            <h5 style={{ margin: "0 0 12px" }}>Season details</h5>
            <ActionForm action={updateSeason} className="form" style={{ gap: 12 }}>
              <input type="hidden" name="season_id" value={season.id} />
              <div className="field">
                <label>GitHub repo (owner/name)</label>
                <input name="repo" className="input mono" defaultValue={season.repo ?? ""} placeholder={`${githubOrg()}/${season.prefix}`} />
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
            <div style={{ borderTop: "1px solid var(--color-divider)", marginTop: 16, paddingTop: 14 }}>
              <h5 style={{ margin: "0 0 6px" }}>GitHub</h5>
              {isGithubConfigured() ? (
                <ActionForm action={syncSeasonToGithub} className="stack" style={{ gap: 8 }}>
                  <input type="hidden" name="season_id" value={season.id} />
                  <div className="text-muted small">
                    {season.repo
                      ? `Adds any missing robot and module folders to ${season.repo}, installs the webhook and protects main.`
                      : `Creates ${githubOrg()}/${season.prefix} with a folder per robot and module, installs the webhook and protects main.`}
                  </div>
                  <div className="row">
                    <Submit pendingText="Syncing…">Sync to GitHub</Submit>
                  </div>
                  <FormNotice />
                </ActionForm>
              ) : (
                <div className="text-muted small">
                  Not connected — set <span className="mono">GITHUB_TOKEN</span> on Vercel to have the hub create repos and folders.
                </div>
              )}
            </div>
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
        ) : (
          season.is_active &&
          subsystems.length > 0 &&
          modules.length === 0 && (
            <Box tint className="pad">
              <h5 style={{ margin: "0 0 6px" }}>Next: modules</h5>
              <p className="small" style={{ margin: "0 0 12px" }}>Subsystems are in. Declare the first module so each department has somewhere to put their files.</p>
              <PrimaryLink href="/modules/new">New module</PrimaryLink>
            </Box>
          )
        )}
      </div>
    </main>
  );
}

function RobotAdmin({ robot, codes, members, canDelete }: { robot: Robot; codes: SubsystemCode[]; members: Member[]; canDelete: boolean }) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary className="small" style={{ cursor: "pointer" }}>Manage {robot.code}</summary>
      <div className="stack" style={{ marginTop: 10, gap: 14 }}>
        {codes.length > 0 && (
          <ActionForm action={addSubsystem} className="inline-form">
            <input type="hidden" name="robot_id" value={robot.id} />
            <select name="code" className="input" required>
              {codes.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
            <select name="lead_id" className="input" defaultValue="">
              <option value="">lead: assign later</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>lead: {displayName(m)}</option>
              ))}
            </select>
            <Submit>Add subsystem</Submit>
            <FormNotice />
            <Link href="/season/new#codes" className="small">Need a new code?</Link>
          </ActionForm>
        )}
        <ActionForm action={updateRobot} className="inline-form">
          <input type="hidden" name="robot_id" value={robot.id} />
          <input name="codename" className="input" defaultValue={robot.codename} required />
          <input name="description" className="input" defaultValue={robot.description ?? ""} placeholder="one line about it" style={{ flex: 1, minWidth: 200 }} />
          <Submit>Save</Submit>
          <FormNotice />
        </ActionForm>
        {canDelete && (
          <form action={deleteRobot}>
            <input type="hidden" name="robot_id" value={robot.id} />
            <button className="btn btn-ghost" type="submit" style={{ fontSize: 12 }}>Remove {robot.code} (it has no modules)</button>
          </form>
        )}
      </div>
    </details>
  );
}
