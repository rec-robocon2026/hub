import Link from "next/link";
import { Box, Corners, Empty, LinkCard, PrimaryLink, Stat, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadDrives, loadEvents, loadMembers, loadSeason, loadSeasons, memberMap } from "@/lib/data";
import { shortDate, timeAgo } from "@/lib/format";
import { seasonGaps } from "@/lib/health";

export default async function HomePage() {
  const { supabase, isLead } = await requireMember();

  const [bundle, seasons, members, drives] = await Promise.all([
    loadSeason(supabase),
    loadSeasons(supabase),
    loadMembers(supabase),
    loadDrives(supabase),
  ]);
  const people = memberMap(members);
  const events = await loadEvents(supabase, { sinceDays: 7, limit: 12 });
  const seasonEvents = bundle ? await loadEvents(supabase, { moduleIds: bundle.modules.map((m) => m.id), limit: 500 }) : [];
  const approved = members.filter((m) => m.role === "member" || m.role === "lead");
  const pending = members.filter((m) => m.role === "pending").length;
  const gaps = bundle ? seasonGaps(bundle, seasonEvents, drives, isLead ? pending : 0) : [];
  const pastSeasons = seasons.filter((s) => !s.is_active);

  const moduleName = new Map(bundle?.modules.map((m) => [m.id, m.name]));
  const competition = bundle?.robots.filter((r) => r.kind === "competition") ?? [];
  const rnd = bundle?.robots.find((r) => r.kind === "rnd");

  return (
    <main className="page">
      {bundle ? (
        <div className="split even" style={{ gridTemplateColumns: "minmax(0, 1.15fr) minmax(0, 1fr)", alignItems: "stretch" }}>
          <Box className="hero-figure duotone">
            <div className="caption">{competition.map((r) => r.codename).join(" · ") || "robots"} · {bundle.season.prefix}</div>
          </Box>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 4 }}>
            <div className="kicker">Season {bundle.season.year} · active</div>
            <h1 style={{ fontSize: "clamp(40px, 5vw, 60px)", margin: "0 0 4px" }}>{competition.map((r) => r.codename).join(" · ") || "No robots yet"}</h1>
            <div className="stack" style={{ gap: 4, margin: "4px 0 20px", maxWidth: "52ch" }}>
              {[...competition, ...(rnd ? [rnd] : [])].map((r) => (
                <div key={r.id} style={{ fontSize: 15 }}>
                  <span className="mono accent-text">{r.code}</span> {r.kind === "rnd" ? "R&D bench" : r.codename}
                  {r.description && <span className="text-muted"> — {r.description}</span>}
                </div>
              ))}
            </div>
            <div className="row" style={{ marginBottom: 22 }}>
              <PrimaryLink href={`/season/${bundle.season.year}`}>Open the season</PrimaryLink>
              <Link className="btn btn-secondary" href="/modules">
                Browse modules
              </Link>
            </div>
            <div className="stats">
              <Stat value={competition.length} label={competition.length === 1 ? "robot" : "robots"} />
              <Stat value={bundle.assets.length} label="items indexed" />
              <Stat value={bundle.assets.filter((a) => a.status === "as_built").length} label="as-built" />
              <Stat value={approved.length} label="members" />
            </div>
          </div>
        </div>
      ) : (
        <Empty
          title="No season yet"
          body={
            isLead
              ? "The hub starts empty. Start the season first — robot, then subsystems — and everything else hangs off it."
              : "The hub starts empty. A lead starts the season first; once they have, modules and items can be added."
          }
          action={isLead ? <PrimaryLink href="/season/new">Start a new season</PrimaryLink> : undefined}
        />
      )}

      <h3 className="section" style={{ marginBottom: 6 }}>Your department</h3>
      <p className="text-muted section-intro">Everything you need is on one page, including adding your own work. Start here.</p>
      <div className="grid">
        <LinkCard href="/programming">
          <div className="card-kicker">Programming</div>
          <div className="card-title">Firmware, vision, simulation</div>
          <div className="card-body">Open the season repo in VS Code, push on a branch, log test runs and tuning notes.</div>
        </LinkCard>
        <LinkCard href="/electronics">
          <div className="card-kicker">Electronics</div>
          <div className="card-title">Schematics, PCB, releases</div>
          <div className="card-body">Board-by-board revisions, the fab-order checklist, and where the Gerbers live.</div>
        </LinkCard>
        <LinkCard href="/mechanical">
          <div className="card-kicker">Mechanical</div>
          <div className="card-title">CAD, drives, as-built</div>
          <div className="card-body">Register a master on the drive, drop the STEP and drawing, mark what was actually built.</div>
        </LinkCard>
      </div>

      <div className="split section">
        <div>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
            <h3 style={{ margin: 0 }}>Recent activity</h3>
            <span className="text-muted small">last 7 days</span>
          </div>
          {events.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Action</th>
                    <th>By</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.id}>
                      <td>
                        {e.asset_id ? (
                          <Link className="mono" href={`/assets/${e.asset_id}`}>{e.detail}</Link>
                        ) : e.module_id ? (
                          <Link href={`/modules/${e.module_id}`}>{e.detail ?? moduleName.get(e.module_id)}</Link>
                        ) : (
                          <span>{e.detail}</span>
                        )}
                        {e.module_id && moduleName.get(e.module_id) && e.asset_id && (
                          <div className="text-muted small">{moduleName.get(e.module_id)}</div>
                        )}
                      </td>
                      <td>
                        {e.action}
                        {e.source === "github" && <> <Tag kind="neutral">{e.branch ?? "push"}</Tag></>}
                      </td>
                      <td>{e.actor_name ?? displayName(people.get(e.actor_id ?? ""))}</td>
                      <td className="text-muted" style={{ whiteSpace: "nowrap" }}>{timeAgo(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty title="Quiet week" body="Nothing added, uploaded or pushed in the last seven days." />
          )}

          <h3 className="section" style={{ marginBottom: 16 }}>Past seasons</h3>
          {pastSeasons.length ? (
            <div className="grid" style={{ ["--min" as string]: "160px" }}>
              {pastSeasons.map((s) => (
                <LinkCard key={s.id} href={`/season/${s.year}`} style={{ padding: 16 }}>
                  <div className="card-kicker">{s.prefix}</div>
                  <div className="card-title">{s.codename ?? "unnamed"}</div>
                  <div className="text-muted small">{s.result ?? "result not recorded"}</div>
                </LinkCard>
              ))}
            </div>
          ) : (
            <p className="text-muted small">None yet — when a new season starts, this one moves here and stays readable.</p>
          )}
        </div>

        <div>
          <h3 style={{ margin: "0 0 16px" }}>Needs attention</h3>
          <div className="stack" style={{ marginBottom: 36 }}>
            {gaps.length ? (
              gaps.map((g, i) => (
                <Link key={i} href={g.href ?? "#"} className="blueprint gap-item">
                  <Corners />
                  <div className="gap-text">{g.text}</div>
                  {g.detail && <div className="text-muted small">{g.detail}</div>}
                </Link>
              ))
            ) : (
              <Box className="gap-item">
                <div className="gap-text">{bundle ? "Nothing missing or stale" : "Start a season to see gaps"}</div>
                <div className="text-muted small">Missing exports, messy names and stale modules show up here.</div>
              </Box>
            )}
          </div>

          <h3 style={{ margin: "0 0 16px" }}>Drives</h3>
          <div className="stack" style={{ marginBottom: 36 }}>
            {drives.length ? (
              drives.map((d) => (
                <Box key={d.id} className="gap-item" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div>
                    <div className="mono" style={{ fontSize: 13 }}>{d.label}</div>
                    <div className="text-muted small">custodian: {d.custodian_id ? displayName(people.get(d.custodian_id)) : "none"}</div>
                  </div>
                  <Tag kind={d.last_mirrored_at ? "accent" : "outline"}>
                    {d.last_mirrored_at ? `MIRRORED ${shortDate(d.last_mirrored_at).toUpperCase()}` : "NOT MIRRORED"}
                  </Tag>
                </Box>
              ))
            ) : (
              <Empty
                title="No drives recorded"
                body="The two CAD drives, each with a custodian."
                action={isLead ? <Link className="btn btn-secondary" href="/mechanical#drives">Add a drive</Link> : undefined}
              />
            )}
          </div>

          <Box tint className="pad">
            <h5 style={{ margin: "0 0 6px" }}>New this year?</h5>
            <p style={{ margin: "0 0 12px", fontSize: 14 }}>Ten minutes to understand where everything lives and how to name a file.</p>
            <Link className="btn btn-secondary btn-block" href="/start">
              Read the quick start
            </Link>
          </Box>
        </div>
      </div>
    </main>
  );
}
