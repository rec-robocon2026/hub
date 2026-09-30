"use client";

import { useState } from "react";
import { startSeason } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Tag } from "@/components/ui";

type LibraryItem = { id: string; name: string; slug: string; code: string; origin: string; note: string | null };

export function StartSeasonForm({
  defaultYear,
  codes,
  library,
}: {
  defaultYear: number;
  codes: { code: string; name: string }[];
  library: LibraryItem[];
}) {
  const [year, setYear] = useState(String(defaultYear));
  const [picked, setPicked] = useState<string[]>(codes.map((c) => c.code));
  const [carry, setCarry] = useState<string[]>([]);
  const prefix = "RC" + (year.trim().slice(-2).padStart(2, "0") || "??");
  const repoName = `rc${year.trim().slice(-2)}-robot`;
  const carried = library.filter((m) => carry.includes(m.id));

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const tree =
    `${repoName}/\n├── modules/\n` +
    (carried.length
      ? carried.map((m) => `│   ├── ${m.slug}/   ← ${m.origin}`).join("\n") + "\n│   └── (new modules added through the hub)\n"
      : "│   └── (modules are added after the season exists)\n") +
    "├── sim/\n├── docs/\n└── README.md";

  return (
    <ActionForm action={startSeason} className="split" style={{ ["--side" as string]: "380px" }}>
      <div className="stack" style={{ gap: 24 }}>
        <Box className="pad-lg">
          <div className="row" style={{ alignItems: "baseline", marginBottom: 14, gap: 14 }}>
            <span className="num">01</span>
            <h4 style={{ margin: 0 }}>The robot</h4>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 14 }}>
            <div className="field">
              <label htmlFor="year">Season</label>
              <input id="year" name="year" className="input mono" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" required />
            </div>
            <div className="field">
              <label htmlFor="codename">Codename</label>
              <input id="codename" name="codename" className="input" placeholder="pick a short word — animals have worked well" required />
            </div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="description">One line about it</label>
            <input id="description" name="description" className="input" placeholder="Autonomous ring-throwing robot. Four-wheel mecanum base, twin-stage arm." />
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label htmlFor="repo">GitHub repo for this season</label>
            <input id="repo" name="repo" className="input mono" placeholder={`rec-robocon2026/${repoName}`} />
            <div className="hint">One repo per season, one folder per module. Pushes to it register automatically. You can set this later.</div>
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Prefix becomes <span className="mono">{prefix}</span> — it goes on every file name for the next twelve months.
          </div>
        </Box>

        <Box className="pad-lg">
          <div className="row" style={{ alignItems: "baseline", marginBottom: 8, gap: 14 }}>
            <span className="num">02</span>
            <h4 style={{ margin: 0 }}>Subsystems on this robot</h4>
          </div>
          <p className="text-muted small">Untick the ones this robot doesn&apos;t have. Leads per subsystem are set on the season page.</p>
          <div className="grid" style={{ ["--min" as string]: "170px", gap: 8 }}>
            {codes.map((c) => (
              <label key={c.code} className="check">
                <input type="checkbox" name="codes" value={c.code} checked={picked.includes(c.code)} onChange={() => toggle(picked, setPicked, c.code)} />
                <span className="mono">{c.code}</span> {c.name}
              </label>
            ))}
          </div>
        </Box>

        <Box className="pad-lg">
          <div className="row" style={{ alignItems: "baseline", marginBottom: 8, gap: 14 }}>
            <span className="num">03</span>
            <h4 style={{ margin: 0 }}>Carry proven modules forward</h4>
          </div>
          {library.length ? (
            <>
              <p className="text-muted small">
                These worked in a past season. Carrying one copies its lanes and parts.yml and keeps its history linked,
                so you start from a working board rather than a blank folder.
              </p>
              <div className="stack" style={{ gap: 0 }}>
                {library.map((m) => (
                  <label key={m.id} className="file-row check" style={{ fontSize: 14 }}>
                    <span className="row">
                      <input type="checkbox" name="carry" value={m.id} checked={carry.includes(m.id)} onChange={() => toggle(carry, setCarry, m.id)} />
                      {m.name}
                      <span className="mono text-muted">modules/{m.slug}/</span>
                    </span>
                    <span className="row">
                      <Tag kind="neutral">{m.code}</Tag>
                      <Tag>FROM {m.origin}</Tag>
                    </span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="text-muted small" style={{ margin: 0 }}>
              The reuse library is empty. Leads mark a module as proven from its page; next season it shows up here.
            </p>
          )}
        </Box>

        <div className="form-actions">
          <Submit primary pendingText="Creating…">Create season</Submit>
          <FormNotice />
        </div>
      </div>

      <div className="stack" style={{ gap: 16 }}>
        <Box className="pad">
          <h5 style={{ margin: "0 0 10px" }}>The repo layout to create</h5>
          <pre className="tree">{tree}</pre>
          <div className="hint">Create it in the club GitHub org, protect main (review required), and add the hub webhook — see Programming.</div>
        </Box>
        <Box tint className="pad">
          <h5 style={{ margin: "0 0 6px" }}>Before you click create</h5>
          <div className="text-muted small" style={{ lineHeight: 1.6 }}>
            Close out last season first — every as-built part needs its STEP and PDF uploaded. Once the season flips to
            past, the people who know which file was the real one have already left.
          </div>
        </Box>
      </div>
    </ActionForm>
  );
}
