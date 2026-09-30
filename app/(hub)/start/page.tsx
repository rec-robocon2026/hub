import type { Metadata } from "next";
import Link from "next/link";
import { Box } from "@/components/ui";
import { displayName, requireMember } from "@/lib/auth";
import { loadMembers, loadSeason } from "@/lib/data";
import { DISCIPLINE_LABEL } from "@/lib/format";
import type { Discipline } from "@/lib/types";

export const metadata: Metadata = { title: "Quick start" };

export default async function QuickStartPage() {
  const { supabase } = await requireMember();
  const [members, bundle] = await Promise.all([loadMembers(supabase), loadSeason(supabase)]);
  const leads = members.filter((m) => m.role === "lead");
  const prefix = bundle?.season.prefix ?? "RC26";

  const steps = [
    {
      title: "You're signed in — tell a lead",
      body: "Your batch year and role come from the member list. Members read everything and add things; leads approve, delete and confirm what was built.",
    },
    {
      title: "Open last season's robot and read one subsystem end to end",
      body: "Pick the one closest to what you'll work on. Read the test logs and notes, not just the CAD — the logs are where the reasoning is.",
      link: bundle ? { href: `/season/${bundle.season.year}`, label: "Open the season" } : undefined,
    },
    {
      title: "Go to your department page and learn the naming rule",
      body: `One pattern for every file and folder: ${prefix}-DRV-WHEELMOD-A-v3. The Add form checks what you type, so learn it before you make a single file.`,
    },
    {
      title: "Know where the three kinds of thing live",
      body: "Code, schematics and PCB in the season's GitHub repo, one folder per module. CAD masters on the two labelled drives. STEP/PDF exports, logs, photos and datasheets in the hub itself.",
    },
    {
      title: "Add one item this week",
      body: "Anything — a datasheet, a photo of a built part, a tuning note. The habit matters more than the item.",
    },
  ];

  const byDept = (d: Discipline) => leads.filter((m) => m.department === d);

  return (
    <main className="page narrow">
      <div className="kicker">Read this first</div>
      <h1 style={{ margin: "0 0 8px", fontSize: "clamp(32px, 4vw, 50px)" }}>Your first week</h1>
      <p style={{ maxWidth: "66ch", fontSize: 17, marginBottom: 40 }}>
        You&apos;re here for two years. Roughly half of what the team knows is written down and the other half is in
        someone&apos;s head. This page is how you get at the first half, and who to ask for the second.
      </p>

      <div className="stack" style={{ gap: 16, marginBottom: 48 }}>
        {steps.map((s, i) => (
          <Box key={i} className="pad-lg" style={{ display: "grid", gridTemplateColumns: "56px 1fr", gap: 20, alignItems: "start" }}>
            <div className="num" style={{ fontSize: 28 }}>{String(i + 1).padStart(2, "0")}</div>
            <div>
              <h4 style={{ margin: "0 0 4px" }}>{s.title}</h4>
              <p style={{ margin: 0 }}>{s.body}</p>
              {s.link && <Link href={s.link.href} className="small">{s.link.label} →</Link>}
            </div>
          </Box>
        ))}
      </div>

      <h3 style={{ margin: "0 0 16px" }}>Three rules that keep this working</h3>
      <div className="grid" style={{ ["--min" as string]: "240px", marginBottom: 48 }}>
        {[
          ["Rule 01", "Nothing under a personal account", "Repos go in the club org. Files go on club drives. If it's only on your laptop, it doesn't exist."],
          ["Rule 02", "Name it the one way", "The pattern is on your department page, next to the field. Two years from now it's the only reason anyone finds your work."],
          ["Rule 03", "Say what was actually built", "The latest CAD is often not the part on the robot. As-built takes one click from a lead and saves a week of confusion."],
        ].map(([k, t, b]) => (
          <Box key={k} className="card">
            <div className="card-kicker">{k}</div>
            <div className="card-title">{t}</div>
            <div className="card-body">{b}</div>
          </Box>
        ))}
      </div>

      <Box dark className="pad-lg">
        <h4 style={{ margin: "0 0 8px", color: "#f2f2f3" }}>Who to ask</h4>
        <div className="grid" style={{ ["--min" as string]: "180px", gap: 14, fontSize: 14 }}>
          {(["mech", "elec", "prog"] as const).map((d) => (
            <div key={d}>
              <strong>{DISCIPLINE_LABEL[d]}</strong>
              <br />
              <span style={{ opacity: 0.8 }}>
                {byDept(d).length ? byDept(d).map((m) => `${displayName(m)}${m.batch ? ` · batch ${m.batch}` : ""}`).join(", ") : "no lead set yet"}
              </span>
            </div>
          ))}
          <div>
            <strong>Anything about the hub</strong>
            <br />
            <span style={{ opacity: 0.8 }}>{leads.filter((m) => !m.department).map(displayName).join(", ") || "whoever is team lead this season"}</span>
          </div>
        </div>
      </Box>
    </main>
  );
}
