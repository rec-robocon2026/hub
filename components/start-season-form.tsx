"use client";

import { useState } from "react";
import { startSeason } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Tag } from "@/components/ui";

type LibraryItem = { id: string; name: string; description: string | null; slug: string; code: string; origin: string; note: string | null };
type RobotRow = { key: number; codename: string; description: string };

export function StartSeasonForm({
  defaultYear,
  org,
  githubConnected,
  codes,
  library,
}: {
  defaultYear: number;
  org: string;
  githubConnected: boolean;
  codes: { code: string; name: string }[];
  library: LibraryItem[];
}) {
  const [year, setYear] = useState(String(defaultYear));
  // Codes come from position, so removing R2 turns R3 into R2 — no gaps.
  const [rows, setRows] = useState<RobotRow[]>([
    { key: 1, codename: "", description: "" },
    { key: 2, codename: "", description: "" },
  ]);
  const robots = rows.map((r, i) => ({ ...r, code: `R${i + 1}` }));
  const [rnd, setRnd] = useState(true);
  const [picked, setPicked] = useState<string[]>(codes.map((c) => c.code));
  const [carry, setCarry] = useState<string[]>([]);
  const yy = year.trim().slice(-2).padStart(2, "0") || "??";
  const prefix = "RC" + yy;
  const repoName = prefix;
  const carried = library.filter((m) => carry.includes(m.id));
  const named = robots.filter((r) => r.codename.trim());

  const toggle = (list: string[], set: (v: string[]) => void, v: string) =>
    set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const setRobot = (i: number, patch: Partial<RobotRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const removeRobot = (i: number) => setRows(rows.filter((_, j) => j !== i));
  const addRobot = () => setRows([...rows, { key: Math.max(0, ...rows.map((r) => r.key)) + 1, codename: "", description: "" }]);

  const folders = [...named.map((r) => r.code), ...(rnd ? ["RD"] : [])];
  const tree =
    `${repoName}/\n` +
    folders
      .map((code) => {
        const mods = code === (named[0]?.code ?? "R1") ? carried.map((m) => `│   ├── ${m.slug}/   ← ${m.origin}`) : [];
        return `├── ${code}/${mods.length ? "\n" + mods.join("\n") : ""}`;
      })
      .join("\n") +
    (folders.length ? "\n" : "") +
    "└── README.md";

  return (
    <ActionForm action={startSeason} className="split" style={{ ["--side" as string]: "380px" }}>
      <div className="stack" style={{ gap: 24 }}>
        <Box className="pad-lg">
          <div className="row" style={{ alignItems: "baseline", marginBottom: 14, gap: 14 }}>
            <span className="num">01</span>
            <h4 style={{ margin: 0 }}>The season</h4>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "120px minmax(0, 1fr)", gap: 14 }}>
            <div className="field">
              <label htmlFor="year">Year</label>
              <input id="year" name="year" className="input mono" value={year} onChange={(e) => setYear(e.target.value)} inputMode="numeric" required />
            </div>
            <div className="field">
              <label htmlFor="repo">GitHub repo for this season</label>
              <input id="repo" name="repo" className="input mono" placeholder={githubConnected ? `leave blank to create ${org}/${repoName}` : `${org}/${repoName}`} />
            </div>
          </div>
          <div className="hint">
            One repo for the whole season: a folder per robot, a folder per module inside it.{" "}
            {githubConnected
              ? `Left blank, the hub creates ${org}/${repoName} with the folders, the push webhook and a protected main.`
              : "GitHub isn't connected, so create the repo yourself and paste it here (or later)."}
          </div>
        </Box>

        <Box className="pad-lg">
          <div className="row" style={{ alignItems: "baseline", marginBottom: 8, gap: 14 }}>
            <span className="num">02</span>
            <h4 style={{ margin: 0 }}>The robots</h4>
          </div>
          <p className="text-muted small">Leave a codename blank to skip that robot. More can be added later from the season page.</p>
          <div className="stack">
            {robots.map((r, i) => (
              <div key={r.key} style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 180px) minmax(0, 1fr) auto", gap: 10, alignItems: "center" }}>
                <input type="hidden" name="robot_code" value={r.code} />
                <span className="mono accent-text">{r.code}</span>
                <input
                  name="robot_codename"
                  className="input"
                  placeholder={i === 0 ? "codename, e.g. KANCIL" : "codename (optional)"}
                  value={r.codename}
                  onChange={(e) => setRobot(i, { codename: e.target.value })}
                  required={i === 0}
                />
                <input name="robot_description" className="input" placeholder="one line — e.g. ring thrower, mecanum base" value={r.description} onChange={(e) => setRobot(i, { description: e.target.value })} />
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 12.5, visibility: robots.length > 1 ? "visible" : "hidden" }}
                  onClick={() => removeRobot(i)}
                  aria-label={`Remove ${r.code}`}
                >
                  Remove
                </button>
              </div>
            ))}
            {robots.length < 9 && (
              <button type="button" className="btn btn-ghost" style={{ justifySelf: "start" }} onClick={addRobot}>
                + another robot
              </button>
            )}
            <label className="check" style={{ borderTop: "1px solid var(--color-divider)", paddingTop: 12 }}>
              <input type="checkbox" checked={rnd} onChange={(e) => setRnd(e.target.checked)} />
              <span><span className="mono accent-text">RD</span> R&amp;D bench — experiments and prototypes, named <span className="mono">{prefix}-RD-…</span></span>
            </label>
            {rnd && (
              <>
                <input type="hidden" name="robot_code" value="RD" />
                <input type="hidden" name="robot_codename" value="R&D" />
                <input type="hidden" name="robot_description" value="Experiments and prototypes. Proven work gets socketed onto a robot." />
              </>
            )}
          </div>
          <div className="hint" style={{ marginTop: 12 }}>
            File names start with <span className="mono">{prefix}-{named[0]?.code ?? "R1"}-</span> — season, then robot. Decide the codes once; they go on every file for the next twelve months.
          </div>
        </Box>

        <Box className="pad-lg">
          <div className="row" style={{ alignItems: "baseline", marginBottom: 8, gap: 14 }}>
            <span className="num">03</span>
            <h4 style={{ margin: 0 }}>Subsystems</h4>
          </div>
          <p className="text-muted small">
            Created on every robot above. Untick what nobody needs; per-robot changes and subsystem leads are set on the season page.
          </p>
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
            <span className="num">04</span>
            <h4 style={{ margin: 0 }}>Carry proven modules forward</h4>
          </div>
          {library.length ? (
            <>
              <p className="text-muted small">
                Copied onto {named[0]?.code ?? "R1"} with their lanes, parts.yml and history link. Later ones can be socketed onto any robot from the Modules page.
              </p>
              <div className="stack" style={{ gap: 0 }}>
                {library.map((m) => (
                  <label key={m.id} className="file-row check" style={{ fontSize: 14 }}>
                    <span className="row">
                      <input type="checkbox" name="carry" value={m.id} checked={carry.includes(m.id)} onChange={() => toggle(carry, setCarry, m.id)} />
                      <span className="mono">{m.name}</span> {m.description}
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
          <h5 style={{ margin: "0 0 10px" }}>{org}/{repoName}</h5>
          <pre className="tree">{tree}</pre>
          <div className="hint">
            {githubConnected
              ? "Created for you. Each module you add later gets its own folder under its robot, with hardware/ firmware/ mech/ sim/."
              : "Create it in the club org, protect main (review required) and add the hub webhook — see Programming."}
          </div>
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
