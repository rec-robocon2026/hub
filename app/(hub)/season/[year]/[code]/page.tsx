import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteSubsystem, setSubsystemLead } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { AssetFlags, Box, Empty, LaneGrid, LinkCard, PageHead, StatusTag, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadEvents, loadMembers, loadSeason, memberMap } from "@/lib/data";
import { DISCIPLINE_LABEL, shortDate } from "@/lib/format";
import { laneStates } from "@/lib/health";
import type { Discipline } from "@/lib/types";

export async function generateMetadata({ params }: PageProps<"/season/[year]/[code]">) {
  const { year, code } = await params;
  return { title: `${code} · ${year}` };
}

export default async function SubsystemPage({ params, searchParams }: PageProps<"/season/[year]/[code]">) {
  const { year, code } = await params;
  const { d } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const bundle = await loadSeason(supabase, Number(year));
  const sub = bundle?.subsystems.find((s) => s.code === code.toUpperCase());
  if (!bundle || !sub) notFound();

  const members = await loadMembers(supabase);
  const people = memberMap(members);
  const mods = bundle.modules.filter((m) => m.subsystem_id === sub.id);
  const events = await loadEvents(supabase, { moduleIds: mods.map((m) => m.id), limit: 40 });
  const all = bundle.assets.filter((a) => a.subsystem_code === sub.code);
  const filter = (typeof d === "string" ? d : "") as Discipline | "";
  const items = filter ? all.filter((a) => a.discipline === filter) : all;
  const carried = mods.filter((m) => m.carried_from);
  const base = `/season/${year}/${sub.code}`;

  return (
    <main className="page">
      <div className="text-muted small" style={{ marginBottom: 6 }}>
        <Link href="/season">Seasons</Link> / <Link href={`/season/${year}`}>{year}</Link> / {bundle.robot?.codename} / {sub.name}
      </div>
      <PageHead
        kicker={<span className="mono accent-text" style={{ letterSpacing: 0, textTransform: "none", fontSize: 14 }}>{bundle.season.prefix}-{sub.code}</span>}
        title={sub.name}
        sub={`lead: ${sub.lead_id ? displayName(people.get(sub.lead_id)) : "none"} · ${all.length} items · ${all.filter((a) => a.status === "as_built").length} as-built`}
        actions={
          <>
            <Link className="btn btn-secondary" href={`/mechanical?module=${mods[0]?.id ?? ""}#add`}>Add mechanical</Link>
            <Link className="btn btn-secondary" href={`/electronics?module=${mods[0]?.id ?? ""}#add`}>Add electronics</Link>
            <Link className="btn btn-secondary" href={`/programming?module=${mods[0]?.id ?? ""}#add`}>Add code</Link>
          </>
        }
      />

      <div className="split" style={{ ["--side" as string]: "320px" }}>
        <div>
          <h4 style={{ margin: "0 0 12px" }}>Modules</h4>
          {mods.length ? (
            <div className="grid" style={{ ["--min" as string]: "240px", marginBottom: 32 }}>
              {mods.map((m) => (
                <LinkCard key={m.id} href={`/modules/${m.id}`}>
                  <div className="mono accent-text" style={{ fontSize: 12 }}>modules/{m.slug}/</div>
                  <div className="card-title">{m.name}</div>
                  <LaneGrid lanes={laneStates(m, bundle.assets, events)} />
                </LinkCard>
              ))}
            </div>
          ) : (
            <div style={{ marginBottom: 32 }}>
              <Empty
                title="No modules in this subsystem"
                body="A module is one physical block — a board, a mount, a gripper. Declare it and every department gets a place to put files."
                action={bundle.season.is_active ? <Link className="btn btn-secondary" href={`/modules/new?subsystem=${sub.id}`}>New module</Link> : undefined}
              />
            </div>
          )}

          <div className="row" style={{ marginBottom: 16, gap: 6 }}>
            <Link href={base} className={`tag ${!filter ? "tag-accent" : "tag-outline"}`}>ALL {all.length}</Link>
            {(["mech", "elec", "prog"] as const).map((k) => (
              <Link key={k} href={`${base}?d=${k}`} className={`tag ${filter === k ? "tag-accent" : "tag-outline"}`}>
                {DISCIPLINE_LABEL[k].toUpperCase()} {all.filter((a) => a.discipline === k).length}
              </Link>
            ))}
          </div>
          {items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Kind</th>
                    <th>Status</th>
                    <th>Where</th>
                    <th>Rev</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <Link href={`/assets/${a.id}`} className="mono">{a.name}</Link>
                        <div className="text-muted small">{a.title}</div>
                        <div className="flags"><AssetFlags asset={a} /></div>
                      </td>
                      <td className="text-muted small">{a.kind}</td>
                      <td><StatusTag status={a.status} /></td>
                      <td className="small">{a.module_name}</td>
                      <td className="text-muted small">{a.revision ? `v${a.revision}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Nothing recorded here yet" body="Use the Add buttons above — each department page has a form suited to its files." />
          )}
        </div>

        <div className="stack" style={{ gap: 28 }}>
          <div>
            <h4 style={{ margin: "0 0 12px" }}>History</h4>
            {events.length ? (
              events.slice(0, 12).map((e) => (
                <div key={e.id} className="history-row">
                  <div className="lane-col">{e.lane ?? "·"}</div>
                  <div>
                    <div style={{ fontSize: 13.5 }}>{e.action}{e.detail ? ` — ${e.detail}` : ""}</div>
                    <div className="text-muted" style={{ fontSize: 12 }}>
                      {e.actor_name ?? displayName(people.get(e.actor_id ?? ""))} · {shortDate(e.created_at)}
                      {e.source === "github" ? ` · ${e.branch}` : ""}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-muted small">No history yet.</p>
            )}
          </div>

          <div>
            <h4 style={{ margin: "0 0 12px" }}>Reused from past seasons</h4>
            {carried.length ? (
              <div className="stack">
                {carried.map((m) => (
                  <Box key={m.id} className="gap-item">
                    <Link href={`/modules/${m.id}`} className="mono">{m.name}</Link>
                    <div className="text-muted small">carried forward — history kept</div>
                  </Box>
                ))}
              </div>
            ) : (
              <p className="text-muted small">Nothing carried into this subsystem.</p>
            )}
          </div>

          {isLead && (
            <Box className="pad">
              <h5 style={{ margin: "0 0 10px" }}>Lead &amp; notes</h5>
              <ActionForm action={setSubsystemLead} className="form" style={{ gap: 10 }}>
                <input type="hidden" name="subsystem_id" value={sub.id} />
                <select name="lead_id" className="input" defaultValue={sub.lead_id ?? ""}>
                  <option value="">no lead</option>
                  {members.filter((m) => m.role === "member" || m.role === "lead").map((m) => (
                    <option key={m.id} value={m.id}>{displayName(m)}</option>
                  ))}
                </select>
                <textarea name="notes" className="input" rows={2} defaultValue={sub.notes ?? ""} placeholder="Anything the next lead should know" />
                <div className="row">
                  <Submit>Save</Submit>
                  <FormNotice />
                </div>
              </ActionForm>
              {mods.length === 0 && (
                <form action={deleteSubsystem} style={{ marginTop: 12 }}>
                  <input type="hidden" name="subsystem_id" value={sub.id} />
                  <input type="hidden" name="year" value={year} />
                  <button className="btn btn-ghost" type="submit">Remove this subsystem</button>
                </form>
              )}
            </Box>
          )}
          {sub.notes && !isLead && (
            <Box className="pad">
              <h5 style={{ margin: "0 0 6px" }}>Notes</h5>
              <p className="small" style={{ margin: 0 }}>{sub.notes}</p>
            </Box>
          )}
          {!bundle.season.is_active && <Tag kind="neutral">PAST SEASON — READ ONLY BY CONVENTION</Tag>}
        </div>
      </div>
    </main>
  );
}
