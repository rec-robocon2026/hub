import type { Metadata } from "next";
import Link from "next/link";
import { carryModule } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Empty, LaneGrid, LinkCard, PrimaryLink, Tag } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadEvents, loadLibrary, loadMembers, loadSeason, memberMap, moduleFolder } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { isStale, laneStates } from "@/lib/health";

export const metadata: Metadata = { title: "Modules" };

export default async function ModulesPage({ searchParams }: PageProps<"/modules">) {
  const { season: seasonParam, robot: robotParam } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const bundle = await loadSeason(supabase, seasonParam ? Number(seasonParam) : undefined);
  const [library, members] = await Promise.all([loadLibrary(supabase, bundle), loadMembers(supabase)]);
  const people = memberMap(members);
  const events = bundle ? await loadEvents(supabase, { moduleIds: bundle.modules.map((m) => m.id), limit: 500 }) : [];
  const subOf = new Map(bundle?.subsystems.map((s) => [s.id, s]));
  const canAdd = !!bundle?.season.is_active && bundle.subsystems.length > 0;
  const robotFilter = typeof robotParam === "string" ? robotParam.toUpperCase() : "";
  const shown = (bundle?.modules ?? []).filter((m) => !robotFilter || subOf.get(m.subsystem_id)?.robotCode === robotFilter);
  const seasonQuery = seasonParam ? `season=${seasonParam}&` : "";

  return (
    <main className="page">
      <div className="kicker">
        {bundle ? `Season ${bundle.season.year}${bundle.season.repo ? ` · ${bundle.season.repo}` : ""}` : "No active season"}
      </div>
      <h1 style={{ margin: "0 0 8px", fontSize: "clamp(32px, 4vw, 48px)" }}>Modules</h1>
      <p className="lede">
        One physical block of the robot, one folder in the repo. Schematic, PCB, firmware, the mechanical exports that
        mount it and its simulation meshes sit together, so a module is reviewable as a unit.
      </p>
      <p className="text-muted lede" style={{ marginBottom: 20 }}>
        Lanes fill in from what&apos;s recorded here and from pushes to the season repo — so a module&apos;s state is what
        actually exists, not what someone remembered to update.
      </p>
      {canAdd && (
        <div style={{ marginBottom: 36 }}>
          <PrimaryLink href="/modules/new">New module</PrimaryLink>
        </div>
      )}

      {!bundle ? (
        <Empty
          title="No season yet"
          body="Modules belong to a season's subsystems. A lead starts the season first."
          action={isLead ? <PrimaryLink href="/season/new">Start a new season</PrimaryLink> : undefined}
        />
      ) : bundle.subsystems.length === 0 ? (
        <Empty
          title="No subsystems yet"
          body="Modules hang off subsystems. A lead adds them on the season page."
          action={<Link className="btn btn-secondary" href={`/season/${bundle.season.year}`}>Go to the season</Link>}
        />
      ) : bundle.modules.length === 0 ? (
        <Empty
          title="No modules yet"
          body="Declare the boards and blocks you know you need — they can be added mid-season too. Or socket in a proven one from the library below."
          action={canAdd ? <PrimaryLink href="/modules/new">New module</PrimaryLink> : undefined}
        />
      ) : (
        <>
        <div className="row" style={{ gap: 6, marginBottom: 16 }}>
          <Link href={`/modules?${seasonQuery}`} className={`tag ${!robotFilter ? "tag-accent" : "tag-outline"}`}>ALL {bundle.modules.length}</Link>
          {bundle.robots.map((r) => (
            <Link key={r.id} href={`/modules?${seasonQuery}robot=${r.code}`} className={`tag ${robotFilter === r.code ? "tag-accent" : "tag-outline"}`}>
              {r.code} {r.kind === "rnd" ? "R&D" : r.codename} {bundle.modules.filter((m) => subOf.get(m.subsystem_id)?.robotCode === r.code).length}
            </Link>
          ))}
        </div>
        <div className="grid" style={{ ["--min" as string]: "270px", marginBottom: 48 }}>
          {shown.map((m) => {
            const sub = subOf.get(m.subsystem_id);
            const last = events.find((e) => e.module_id === m.id);
            const items = bundle.assets.filter((a) => a.module_id === m.id);
            const flagged = items.filter((a) => !a.name_ok || a.missing_exports).length;
            return (
              <LinkCard key={m.id} href={`/modules/${m.id}`}>
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <div className="mono accent-text" style={{ fontSize: 12 }}>{m.name}-v{m.current_version}</div>
                  <Tag kind={sub?.robotCode === "RD" ? "outline" : "neutral"}>{sub?.robotCode}·{sub?.code}</Tag>
                </div>
                <div className="card-title big">{m.description || m.name}</div>
                <div className="text-muted mono" style={{ fontSize: 11.5 }}>{moduleFolder(sub?.robotCode ?? "", m.slug)}</div>
                <LaneGrid lanes={laneStates(m, bundle.assets, events)} />
                <div className="text-muted" style={{ fontSize: 12, lineHeight: 1.5 }}>
                  {last
                    ? `${last.action} — ${last.actor_name ?? displayName(people.get(last.actor_id ?? ""))}, ${timeAgo(last.created_at)}`
                    : "nothing yet"}
                </div>
                <div className="row" style={{ gap: 4 }}>
                  {m.status === "as_built" && <Tag kind="accent">AS-BUILT</Tag>}
                  {m.carried_from && <Tag>CARRIED</Tag>}
                  {m.is_proven && <Tag>PROVEN</Tag>}
                  {flagged > 0 && <Tag kind="warn">{flagged} FLAGGED</Tag>}
                  {items.length === 0 && <Tag kind="warn">EMPTY</Tag>}
                  {isStale(m, bundle.assets, events) && <Tag kind="warn">STALE</Tag>}
                </div>
              </LinkCard>
            );
          })}
        </div>
        </>
      )}

      <h3 className="section" style={{ margin: "0 0 6px" }}>Reuse library</h3>
      <p className="text-muted section-intro">
        Modules that worked — from past seasons, and proven prototypes from this season&apos;s R&amp;D bench. Socketing one
        onto a robot copies its lanes and <span className="mono">parts.yml</span> and keeps its history linked, so you start
        from a proven board instead of a blank folder.
      </p>
      {library.length ? (
        <div className="grid" style={{ ["--min" as string]: "280px" }}>
          {library.map((m) => (
            <Box key={m.id} className="pad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
                <div className="mono accent-text" style={{ fontSize: 12 }}>{m.name}-v{m.current_version}</div>
                <Tag kind="neutral">{m.code}</Tag>
              </div>
              <Link href={`/modules/${m.id}`} style={{ color: "inherit", textDecoration: "none" }}>
                <div className="card-title big" style={{ margin: "4px 0 8px" }}>{m.description || m.name}</div>
              </Link>
              <div className="text-muted small" style={{ lineHeight: 1.55, marginBottom: 12 }}>{m.proven_note ?? m.description ?? "No note."}</div>
              <div className="row" style={{ gap: 6, marginBottom: 14 }}>
                {m.lanes.map((l) => (
                  <Tag key={l} kind="neutral">{l}</Tag>
                ))}
              </div>
              {canAdd && bundle && (
                <ActionForm action={carryModule} className="stack" style={{ gap: 6 }}>
                  <input type="hidden" name="module_id" value={m.id} />
                  <div className="row" style={{ flexWrap: "nowrap" }}>
                    <select name="robot_id" className="input" defaultValue={bundle.robots.find((r) => r.kind === "competition")?.id}>
                      {bundle.robots
                        .filter((r) => !m.origin.endsWith(`-${r.code}`) || !m.origin.startsWith(bundle.season.prefix))
                        .map((r) => (
                          <option key={r.id} value={r.id}>
                            onto {bundle.season.prefix}-{r.code} {r.kind === "rnd" ? "R&D" : r.codename}
                          </option>
                        ))}
                    </select>
                    <Submit pendingText="Socketing…">Socket</Submit>
                  </div>
                  <FormNotice />
                </ActionForm>
              )}
            </Box>
          ))}
        </div>
      ) : (
        <Empty
          title="The library is empty"
          body="When a module has proven itself, a lead marks it proven from its page. It then shows up here for every future season."
        />
      )}
    </main>
  );
}
