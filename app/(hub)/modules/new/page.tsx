import type { Metadata } from "next";
import Link from "next/link";
import { NewModuleForm } from "@/components/new-module-form";
import { Empty, PrimaryLink } from "@/components/ui";
import { requireMember } from "@/lib/auth";
import { loadSeason } from "@/lib/data";

export const metadata: Metadata = { title: "New module" };

export default async function NewModulePage({ searchParams }: PageProps<"/modules/new">) {
  const { subsystem } = await searchParams;
  const { supabase, isLead } = await requireMember();
  const bundle = await loadSeason(supabase);

  return (
    <main className="page" style={{ maxWidth: 1180 }}>
      <div className="kicker">{bundle ? `Season ${bundle.season.year}` : "No active season"}</div>
      <h1 style={{ margin: "0 0 8px", fontSize: "clamp(32px, 4vw, 48px)" }}>New module</h1>
      <p className="lede">
        A module is the unit of work for all three departments at once. Declaring it here gives mechanical, electronics
        and programming each somewhere to put their first file instead of inventing a location.
      </p>
      <p className="text-muted lede" style={{ marginBottom: 32 }}>
        Or <Link href="/modules">socket in a proven module</Link> from a past season.
      </p>

      {!bundle ? (
        <Empty
          title="No season yet"
          body="Modules belong to a season. A lead starts it first."
          action={isLead ? <PrimaryLink href="/season/new">Start a new season</PrimaryLink> : undefined}
        />
      ) : bundle.subsystems.length === 0 ? (
        <Empty
          title="No subsystems yet"
          body="Every module belongs to a subsystem. A lead adds them on the season page first."
          action={<Link className="btn btn-secondary" href={`/season/${bundle.season.year}`}>Go to the season</Link>}
        />
      ) : (
        <NewModuleForm
          subsystems={bundle.subsystems.map((s) => ({ id: s.id, code: s.code, name: s.name }))}
          defaultSubsystem={typeof subsystem === "string" ? subsystem : undefined}
          repo={bundle.season.repo ?? `rc${String(bundle.season.year).slice(-2)}-robot`}
          taken={bundle.modules.map((m) => `${m.subsystem_id}/${m.slug}`)}
        />
      )}
    </main>
  );
}
