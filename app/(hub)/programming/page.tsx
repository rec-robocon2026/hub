import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { AddSection } from "@/components/add-section";
import { AssetFlags, Box, Corners, Code, Empty, PageHead, StatusTag, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadDrives, loadEvents, loadMembers, loadSeason, memberMap } from "@/lib/data";
import { timeAgo, vscodeClone } from "@/lib/format";

export const metadata: Metadata = { title: "Programming" };

export default async function ProgrammingPage({ searchParams }: PageProps<"/programming">) {
  const { module } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const [bundle, drives, members] = await Promise.all([loadSeason(supabase), loadDrives(supabase), loadMembers(supabase)]);
  const people = memberMap(members);
  const pushes = bundle ? await loadEvents(supabase, { moduleIds: bundle.modules.map((m) => m.id), source: "github", limit: 15 }) : [];
  const items = bundle?.assets.filter((a) => a.discipline === "prog") ?? [];
  const leads = members.filter((m) => m.role === "lead" && m.department === "prog");
  const repo = bundle?.season.repo;
  const moduleName = new Map(bundle?.modules.map((m) => [m.id, m.name]));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("x-forwarded-host") ?? h.get("host")}`;

  return (
    <main className="page">
      <PageHead
        kicker="Department"
        title="Programming"
        sub={`lead: ${leads.length ? leads.map(displayName).join(", ") : "not set"} · firmware, vision, simulation`}
      />
      <p className="text-muted lede" style={{ marginTop: -16, marginBottom: 40 }}>
        Source lives in the club GitHub org — one repo per season, one folder per module. Pushes register here
        automatically. Changes go through branches; a lead&apos;s review is the only way into <span className="mono">main</span>.
      </p>

      <h3 style={{ margin: "0 0 6px" }}>This season&apos;s repository</h3>
      <p className="text-muted section-intro">
        <strong>Open in VS Code</strong> clones it for you — VS Code asks where to put the folder, clones, and opens it.
      </p>
      {repo ? (
        <Box className="pad-lg" style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 20, alignItems: "center" }}>
          <div>
            <div className="row" style={{ alignItems: "baseline", marginBottom: 3 }}>
              <span className="mono" style={{ fontSize: 14 }}>{repo}</span>
              <Tag kind="neutral">main — protected</Tag>
            </div>
            <div className="text-muted small">The whole robot — every module&apos;s hardware, firmware, mech exports and sim assets.</div>
          </div>
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <a className="btn btn-primary blueprint" href={vscodeClone(repo)}>
              <Corners />
              Open in VS Code
            </a>
            <a className="btn btn-secondary" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">Open in browser</a>
          </div>
        </Box>
      ) : (
        <Empty
          title="No repo set for this season"
          body="Once a lead sets the season's GitHub repo, it appears here with a one-click clone, and pushes to it start registering."
          action={isLead && bundle ? <Link className="btn btn-secondary" href={`/season/${bundle.season.year}`}>Set the repo</Link> : undefined}
        />
      )}

      <h3 className="section" style={{ margin: "44px 0 6px" }}>The loop, end to end</h3>
      <p className="text-muted section-intro">
        You cannot push to <span className="mono">main</span> — the branch is protected, so GitHub rejects it. Approval is not a policy anyone has to remember; it is the only path that works.
      </p>
      <div className="grid" style={{ ["--min" as string]: "200px" }}>
        {[
          ["01", "Open in VS Code", "The button above clones and opens. Nothing typed."],
          ["02", "Branch, edit, commit", "Make a branch named after the change. Source Control lists what you changed; commit there."],
          ["03", "Push the branch", "It shows up below within seconds, against the module folder you touched."],
          ["04", "A lead reviews", "Open a pull request on GitHub. Merging needs a lead's approval — that's the only way into main."],
        ].map(([n, t, b], i) => (
          <Box key={n} tint={i === 3} className="pad">
            <div className="num">{n}</div>
            <h5 style={{ margin: "0 0 4px" }}>{t}</h5>
            <div className="text-muted small" style={{ lineHeight: 1.55 }}>{b}</div>
          </Box>
        ))}
      </div>

      <div className="split section">
        <div>
          <h3 style={{ margin: "0 0 16px" }}>Recent pushes</h3>
          {pushes.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Lane</th>
                    <th>Commit</th>
                    <th>Who</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {pushes.map((e) => (
                    <tr key={e.id}>
                      <td>{e.lane ? <Tag>{e.lane}</Tag> : "·"}</td>
                      <td>
                        <div style={{ fontSize: 13.5 }}>{e.action}</div>
                        <div className="text-muted mono" style={{ fontSize: 11.5 }}>
                          {e.sha?.slice(0, 7)} · <Link href={`/modules/${e.module_id}`}>{moduleName.get(e.module_id ?? "")}</Link> · {e.branch}
                          {e.branch !== "main" && <> <Tag kind="neutral">IN REVIEW</Tag></>}
                        </div>
                      </td>
                      <td className="small">{e.actor_name}</td>
                      <td className="text-muted small" style={{ whiteSpace: "nowrap" }}>{timeAgo(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty
              title="No pushes registered yet"
              body={repo ? "Push to a module folder (modules/<module>/…) in the season repo and it lands here. If nothing arrives, check the webhook on the right." : "Set the season repo first."}
            />
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <Box tint className="pad">
            <h5 style={{ margin: "0 0 8px" }}>How pushes register</h5>
            <div className="small" style={{ lineHeight: 1.6 }}>
              GitHub calls the hub on every push. Files under <span className="mono">modules/&lt;module&gt;/</span> are matched to the module and lane:
              <span className="mono"> hardware/</span> → SCH/PCB, <span className="mono">firmware/</span> → FW,
              <span className="mono"> mech/</span> → MECH, <span className="mono">sim/</span> → SIM.
            </div>
          </Box>
          {isLead && (
            <Box className="pad">
              <h5 style={{ margin: "0 0 8px" }}>Webhook setup (leads, once per repo)</h5>
              <div className="small" style={{ lineHeight: 1.7 }}>
                Repo → Settings → Webhooks → Add webhook
                <div>Payload URL: <span className="mono" style={{ wordBreak: "break-all" }}>{origin}/api/github/webhook</span></div>
                <div>Content type: <span className="mono">application/json</span></div>
                <div>Secret: the <span className="mono">GITHUB_WEBHOOK_SECRET</span> value</div>
                <div>Events: just the push event</div>
              </div>
              <div className="hint">Then Settings → Branches → protect <span className="mono">main</span>: require a pull request with 1 approval.</div>
            </Box>
          )}
        </div>
      </div>

      <h3 className="section" style={{ margin: "44px 0 6px" }}>Commands</h3>
      <p className="text-muted section-intro">The everyday ones. Keep the real versions in each README so they can&apos;t drift.</p>
      <div className="grid" style={{ ["--min" as string]: "320px" }}>
        <Code label="Start a change">{`git switch -c ${bundle?.season.prefix.toLowerCase() ?? "rc26"}-drv-fix-encoder
# …edit…
git add -A
git commit -m "fw: fix encoder direction on rear-left"
git push -u origin HEAD`}</Code>
        <Code label="Build and flash (PlatformIO)">{`cd modules/<module>/firmware
pio run                        # build only
pio run -t upload              # flash the board
pio device monitor -b 115200   # serial output`}</Code>
      </div>

      <h3 className="section" style={{ margin: "44px 0 16px" }}>Logs, notes &amp; sim assets this season</h3>
      {items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Kind</th>
                <th>Module</th>
                <th>Status</th>
                <th>Added</th>
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
                  <td className="small"><Link href={`/modules/${a.module_id}`}>{a.module_name}</Link></td>
                  <td><StatusTag status={a.status} /></td>
                  <td className="text-muted small">{displayName(people.get(a.created_by ?? ""))} · {timeAgo(a.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-muted small">Nothing yet. Test logs, calibration runs and tuning notes go here — code itself arrives through pushes.</p>
      )}

      <AddSection
        discipline="prog"
        bundle={bundle}
        drives={drives}
        isLead={isLead}
        moduleId={typeof module === "string" ? module : undefined}
        intro="For things that aren't a code change — a calibration run, a test log, a tuning note, or a link to firmware. Code itself arrives through pushes."
      />
    </main>
  );
}
