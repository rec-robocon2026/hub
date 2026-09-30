import type { Metadata } from "next";
import { addCode } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { StartSeasonForm } from "@/components/start-season-form";
import { Box } from "@/components/ui";
import { requireLead } from "@/lib/auth";
import { loadCodes, loadLibrary, loadSeason, loadSeasons } from "@/lib/data";

export const metadata: Metadata = { title: "Start a new season" };

export default async function NewSeasonPage() {
  const { supabase } = await requireLead();
  const [codes, seasons, active] = await Promise.all([loadCodes(supabase), loadSeasons(supabase), loadSeason(supabase)]);
  const library = await loadLibrary(supabase, null);
  const nextYear = Math.max(new Date().getFullYear(), ...seasons.map((s) => s.year + 1));

  return (
    <main className="page" style={{ maxWidth: 1080 }}>
      <div className="kicker">Leads only · once a year</div>
      <h1 style={{ margin: "0 0 8px", fontSize: "clamp(32px, 4vw, 48px)" }}>Start a new season</h1>
      <p className="lede">
        The twenty minutes at the start of the year that decide whether next year&apos;s batch can find anything. Declare
        the robot and its subsystems here; modules and items are added after, in that order.
      </p>
      {active && (
        <p className="text-muted lede" style={{ marginBottom: 32 }}>
          Creating a season makes it the active one. {active.season.prefix} ({active.robot?.codename}) moves to past
          seasons and stays readable.
        </p>
      )}

      <StartSeasonForm
        defaultYear={nextYear}
        codes={codes.map((c) => ({ code: c.code, name: c.name }))}
        library={library.map((m) => ({ id: m.id, name: m.name, slug: m.slug, code: m.code, origin: m.origin, note: m.proven_note }))}
      />

      <Box className="pad-lg section" style={{ maxWidth: 640 }}>
        <h4 style={{ margin: "0 0 6px" }}>Add a subsystem code</h4>
        <p className="text-muted small">
          Codes are fixed for the club, not chosen per season — that is what makes a search for a drivetrain part return
          four years of results. Adding one is permanent.
        </p>
        <ActionForm action={addCode} className="inline-form">
          <input className="input mono" name="code" placeholder="SHT" maxLength={3} style={{ width: 80 }} required />
          <input className="input" name="name" placeholder="Shooter" required />
          <Submit>Add code</Submit>
          <FormNotice />
        </ActionForm>
      </Box>
    </main>
  );
}
