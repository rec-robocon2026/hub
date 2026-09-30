import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteModule, setModuleStatus, setProven, updateModule } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { AssetFlags, Box, Empty, LaneGrid, PageHead, StatusTag, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { GithubNotice } from "@/components/github-notice";
import { ProposalList } from "@/components/proposal-list";
import { WorkOnModule } from "@/components/work-on-module";
import { loadProposals } from "@/lib/proposals";
import { loadEvents, loadLineage, loadMembers, memberMap, moduleFolder } from "@/lib/data";
import { DISCIPLINE_PATH, shortDate, STATUS_LABEL, timeAgo, vscodeClone } from "@/lib/format";
import { laneStates } from "@/lib/health";
import type { AssetHealth, Module, Robot, Season, Subsystem } from "@/lib/types";
import { LANES, STATUSES } from "@/lib/types";

type ModuleRow = Module & { subsystems: Subsystem & { robots: Robot & { seasons: Season } } };

export default async function ModulePage({ params, searchParams }: PageProps<"/modules/[id]">) {
  const { id } = await params;
  const { gh, ghok } = await searchParams;
  const { supabase, isLead, member: me } = await requireMember();
  const { data } = await supabase.from("modules").select("*, subsystems(*, robots(*, seasons(*)))").eq("id", id).maybeSingle();
  if (!data) notFound();
  const m = data as ModuleRow;
  const season = m.subsystems.robots.seasons;

  const [{ data: assetRows }, lineage, members] = await Promise.all([
    supabase.from("asset_health").select("*").eq("module_id", id).order("name"),
    loadLineage(supabase, m),
    loadMembers(supabase),
  ]);
  const assets = (assetRows as AssetHealth[] | null) ?? [];
  const events = await loadEvents(supabase, { moduleIds: [m.id, ...lineage.map((l) => l.id)], limit: 100 });
  const [requests, { data: workspaces }, { data: myKey }] = await Promise.all([
    loadProposals(supabase, { moduleId: m.id, limit: 10 }),
    supabase.from("workspaces").select("hostname, path, updated_at").eq("repo", season.repo ?? "").order("updated_at", { ascending: false }),
    supabase.from("cli_keys").select("id").limit(1),
  ]);
  const liveRequests = requests.proposals.filter((p) => p.status === "open" || p.status === "changes_requested");
  const people = memberMap(members);
  const prefixOf = new Map([[m.id, season.prefix], ...lineage.map((l) => [l.id, l.prefix] as const)]);
  const robot = m.subsystems.robots;
  const folder = moduleFolder(robot.code, m.slug);

  return (
    <main className="page">
      <div className="text-muted small" style={{ marginBottom: 6 }}>
        <Link href={`/season/${season.year}`}>{season.prefix}</Link> / {robot.code} {robot.kind === "rnd" ? "R&D" : robot.codename} /{" "}
        <Link href={`/season/${season.year}/${robot.code}/${m.subsystems.code}`}>{m.subsystems.code}</Link> / <Link href="/modules">Modules</Link>
      </div>
      <PageHead
        kicker={<span className="mono accent-text" style={{ letterSpacing: 0, textTransform: "none", fontSize: 13 }}>{folder}</span>}
        title={m.name}
        sub={m.description ?? undefined}
        actions={
          <>
            <StatusTag status={m.status} />
            {m.is_proven && <Tag>PROVEN</Tag>}
            {lineage.length > 0 && <Tag>CARRIED FROM {lineage.map((l) => l.prefix).join(" → ")}</Tag>}
            {season.repo && (
              <a className="btn btn-secondary" href={`https://github.com/${season.repo}/tree/main/${folder}`} target="_blank" rel="noreferrer">
                Open on GitHub
              </a>
            )}
            {season.repo && <a className="btn btn-secondary" href={vscodeClone(season.repo)}>Open in VS Code</a>}
          </>
        }
      />

      <GithubNotice gh={gh} ghok={ghok} />
      <div style={{ maxWidth: 520, marginBottom: 32 }}>
        <LaneGrid lanes={laneStates(m, assets, events.filter((e) => e.module_id === m.id))} />
      </div>

      <div className="split" style={{ ["--side" as string]: "340px" }}>
        <div>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 12 }}>
            <h4 style={{ margin: 0 }}>Assets</h4>
            <div className="row">
              <Link className="btn btn-secondary" href={`${DISCIPLINE_PATH.mech}?module=${m.id}#add`}>Add mechanical</Link>
              <Link className="btn btn-secondary" href={`${DISCIPLINE_PATH.elec}?module=${m.id}#add`}>Add electronics</Link>
              <Link className="btn btn-secondary" href={`${DISCIPLINE_PATH.prog}?module=${m.id}#add`}>Add code</Link>
            </div>
          </div>
          {assets.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <tr key={a.id}>
                      <td><Tag kind={a.lane === "MECH" || a.lane === "SIM" ? "accent" : "outline"}>{a.lane ?? "—"}</Tag></td>
                      <td>
                        <Link href={`/assets/${a.id}`} className="mono">{a.name}</Link>
                        <div className="text-muted small">{a.title}</div>
                        <div className="flags"><AssetFlags asset={a} /></div>
                      </td>
                      <td className="text-muted small">{a.kind}</td>
                      <td><StatusTag status={a.status} /></td>
                      <td className="text-muted small">{a.revision ? `v${a.revision}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="Nothing recorded for this module"
              body="Add the first file from whichever department gets there first — the CAD master, the schematic, or the firmware link."
              action={<Link className="btn btn-secondary" href={`${DISCIPLINE_PATH.mech}?module=${m.id}#add`}>Add the first item</Link>}
            />
          )}

          {liveRequests.length > 0 && (
            <>
              <h4 className="section" style={{ margin: "40px 0 12px" }}>Requests waiting for a lead</h4>
              <ProposalList proposals={liveRequests} people={people} moduleLabel={requests.moduleLabel} isLead={isLead} meId={me.id} emptyText="" />
            </>
          )}

          <h4 className="section" style={{ margin: "40px 0 12px" }}>History — every lane, one feed</h4>
          {events.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>What</th>
                    <th>Who</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>{e.lane ? <Tag kind={e.lane === "MECH" || e.lane === "SIM" ? "accent" : "outline"}>{e.lane}</Tag> : <span className="text-muted">·</span>}</td>
                      <td>
                        <div style={{ fontSize: 13.5 }}>
                          {e.action}
                          {e.module_id !== m.id && <> <Tag kind="neutral">{prefixOf.get(e.module_id ?? "")}</Tag></>}
                        </div>
                        <div className="text-muted mono" style={{ fontSize: 11.5 }}>
                          {[e.sha?.slice(0, 7), e.detail, e.source === "github" ? e.branch : null].filter(Boolean).join(" · ")}
                          {e.source === "github" && e.branch && e.branch !== "main" ? " · in review" : ""}
                        </div>
                      </td>
                      <td className="small">{e.actor_name ?? displayName(people.get(e.actor_id ?? ""))}</td>
                      <td className="text-muted small" style={{ whiteSpace: "nowrap" }} title={e.created_at}>{timeAgo(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-muted small">No history yet. Adding items and pushing to <span className="mono">{folder}</span> both land here.</p>
          )}
        </div>

        <div className="stack" style={{ gap: 20 }}>
          {season.repo && season.is_active && (
            <WorkOnModule
              moduleId={m.id}
              folder={folder}
              repo={season.repo}
              cloneUrl={vscodeClone(season.repo)}
              workspaces={workspaces ?? []}
              hasKey={Boolean(myKey?.length)}
            />
          )}
          <Box className="pad">
            <h5 style={{ margin: "0 0 10px" }}>Status</h5>
            <ActionForm action={setModuleStatus} className="inline-form">
              <input type="hidden" name="module_id" value={m.id} />
              <select name="status" className="input" defaultValue={m.status}>
                {STATUSES.filter((s) => isLead || s !== "as_built" || m.status === "as_built").map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </select>
              <Submit>Set</Submit>
              <FormNotice />
            </ActionForm>
            {!isLead && <div className="hint">Only leads can mark a module as-built.</div>}
          </Box>

          <Box className="pad">
            <h5 style={{ margin: "0 0 10px" }}>Lanes, notes &amp; parts.yml</h5>
            <ActionForm action={updateModule} className="form" style={{ gap: 12 }}>
              <input type="hidden" name="module_id" value={m.id} />
              <div className="chips">
                {LANES.map((l) => (
                  <label key={l} className="check small">
                    <input type="checkbox" name="lanes" value={l} defaultChecked={m.lanes.includes(l)} /> {l}
                  </label>
                ))}
              </div>
              <input name="description" className="input" defaultValue={m.description ?? ""} placeholder="One line about it" />
              <textarea name="parts_yml" className="input mono" rows={8} defaultValue={m.parts_yml ?? ""} style={{ fontSize: 12 }} />
              <div className="hint" style={{ marginTop: 0 }}>
                <span className="mono">parts.yml</span> names each part and its drive path, so the repo knows what the
                module is made of. It travels with the module when it&apos;s carried to a new season.
              </div>
              <div className="row">
                <Submit>Save</Submit>
                <FormNotice />
              </div>
            </ActionForm>
          </Box>

          {lineage.length > 0 && (
            <Box className="pad">
              <h5 style={{ margin: "0 0 10px" }}>Lineage</h5>
              {lineage.map((l) => (
                <div key={l.id} className="history-row" style={{ gridTemplateColumns: "52px 1fr" }}>
                  <div className="lane-col">{l.prefix}</div>
                  <div className="small"><Link href={`/modules/${l.id}`}>{l.name}</Link> · {STATUS_LABEL[l.status]}</div>
                </div>
              ))}
            </Box>
          )}

          {isLead && (
            <Box tint className="pad">
              <h5 style={{ margin: "0 0 8px" }}>Reuse library</h5>
              <ActionForm action={setProven} className="form" style={{ gap: 10 }}>
                <input type="hidden" name="module_id" value={m.id} />
                <input type="hidden" name="proven" value={m.is_proven ? "false" : "true"} />
                {!m.is_proven && <textarea name="proven_note" className="input" rows={2} placeholder="Why it's trustworthy, what to check before reusing" />}
                {m.is_proven && m.proven_note && <p className="small" style={{ margin: 0 }}>{m.proven_note}</p>}
                <div className="row">
                  <Submit>{m.is_proven ? "Remove from library" : "Mark as proven"}</Submit>
                  <FormNotice />
                </div>
              </ActionForm>
            </Box>
          )}

          {isLead && (
            <details>
              <summary className="text-muted small" style={{ cursor: "pointer" }}>Delete module</summary>
              <form action={deleteModule} style={{ marginTop: 8 }}>
                <input type="hidden" name="module_id" value={m.id} />
                <button className="btn btn-secondary" type="submit">Delete {m.name}, its {assets.length} items and their files</button>
              </form>
            </details>
          )}

          <div className="text-muted small">Created {shortDate(m.created_at)} · updated {timeAgo(m.updated_at)}</div>
        </div>
      </div>
    </main>
  );
}
