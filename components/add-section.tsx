import Link from "next/link";
import { AddItemForm } from "@/components/add-item-form";
import { Empty, PrimaryLink } from "@/components/ui";
import { moduleOptions, type SeasonBundle } from "@/lib/data";
import type { Discipline, Drive } from "@/lib/types";

/** "Add an item" block for a department page, with the right empty state when a prerequisite is missing. */
export function AddSection({
  discipline,
  bundle,
  drives,
  isLead,
  moduleId,
  intro,
}: {
  discipline: Discipline;
  bundle: SeasonBundle | null;
  drives: Drive[];
  isLead: boolean;
  moduleId?: string;
  intro: string;
}) {
  const modules = moduleOptions(bundle);
  return (
    <section id="add" className="section">
      <h3 style={{ margin: "0 0 6px" }}>Add an item</h3>
      <p className="text-muted section-intro">{intro}</p>
      {!bundle ? (
        <Empty
          title="No season yet"
          body="Items belong to a module, modules to a subsystem, subsystems to a season. A lead starts the season first."
          action={isLead ? <PrimaryLink href="/season/new">Start a new season</PrimaryLink> : undefined}
        />
      ) : !bundle.season.is_active ? (
        <Empty title="This is a past season" body="Add to the active season instead." />
      ) : modules.length === 0 ? (
        <Empty
          title={bundle.subsystems.length ? "No modules yet" : "No subsystems yet"}
          body={
            bundle.subsystems.length
              ? "Every item belongs to a module. Declare the module first — it takes a minute."
              : "Every item belongs to a module, and every module to a subsystem. A lead adds subsystems on the season page."
          }
          action={
            bundle.subsystems.length ? (
              <PrimaryLink href="/modules/new">New module</PrimaryLink>
            ) : (
              <Link className="btn btn-secondary" href={`/season/${bundle.season.year}`}>Go to the season</Link>
            )
          }
        />
      ) : (
        <AddItemForm
          discipline={discipline}
          modules={modules}
          drives={drives.map((d) => ({ id: d.id, label: d.label }))}
          isLead={isLead}
          defaultModuleId={moduleId && modules.some((m) => m.id === moduleId) ? moduleId : undefined}
        />
      )}
    </section>
  );
}
