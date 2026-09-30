import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Empty, LinkCard, PrimaryLink } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { loadSeasons } from "@/lib/data";

export const metadata: Metadata = { title: "Season" };

export default async function SeasonIndex() {
  const { supabase, isLead } = await requireMember();
  const seasons = await loadSeasons(supabase);
  const active = seasons.find((s) => s.is_active);
  if (active) redirect(`/season/${active.year}`);

  return (
    <main className="page">
      <div className="kicker">Seasons</div>
      <h1 style={{ marginBottom: 20 }}>No active season</h1>
      <Empty
        title={seasons.length ? "Every season is retired" : "The hub is empty"}
        body={
          isLead
            ? "Start the season: year, robot codename, and which subsystems it has. Modules and items are added after, in that order."
            : "A lead starts each season. Once there is one, you can add modules and items to it."
        }
        action={isLead ? <PrimaryLink href="/season/new">Start a new season</PrimaryLink> : undefined}
      />
      {seasons.length > 0 && (
        <div className="grid section" style={{ ["--min" as string]: "160px" }}>
          {seasons.map((s) => (
            <LinkCard key={s.id} href={`/season/${s.year}`}>
              <div className="card-kicker">{s.prefix}</div>
              <div className="card-title">{s.codename ?? "unnamed"}</div>
              <div className="text-muted small">{s.result ?? "result not recorded"}</div>
            </LinkCard>
          ))}
        </div>
      )}
    </main>
  );
}
