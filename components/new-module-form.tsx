"use client";

import { useState } from "react";
import { createModule } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box } from "@/components/ui";
import { moduleCode } from "@/lib/naming";
import type { Lane } from "@/lib/types";

const LANE_OPTIONS: { lane: Lane; label: string; folder: string; seed: string }[] = [
  { lane: "SCH", label: "Schematic", folder: "hardware", seed: "*.kicad_sch" },
  { lane: "PCB", label: "PCB", folder: "hardware", seed: "release/" },
  { lane: "FW", label: "Firmware", folder: "firmware", seed: "platformio.ini" },
  { lane: "MECH", label: "CAD exports", folder: "mech", seed: "parts.yml" },
  { lane: "SIM", label: "Simulation", folder: "sim", seed: "*.urdf.xacro" },
];

export function NewModuleForm({
  subsystems,
  defaultSubsystem,
  repo,
  prefix,
}: {
  /** next: the number the next module in that subsystem gets. */
  subsystems: { id: string; code: string; name: string; robot: string; robotName: string; next: number }[];
  defaultSubsystem?: string;
  repo: string;
  prefix: string;
}) {
  const [subsystemId, setSubsystemId] = useState(defaultSubsystem ?? subsystems[0].id);
  const [lanes, setLanes] = useState<Lane[]>(["SCH", "PCB", "FW", "MECH"]);
  const sub = subsystems.find((s) => s.id === subsystemId) ?? subsystems[0];
  const robot = sub.robot;
  const code = moduleCode(prefix, sub.robot, sub.code, sub.next);
  const slug = `${sub.code.toLowerCase()}-${String(sub.next).padStart(2, "0")}`;

  const folders = [...new Set(LANE_OPTIONS.filter((o) => lanes.includes(o.lane)).map((o) => o.folder))];
  const tree =
    `${robot}/${slug}/\n` +
    folders
      .map((f, i) => {
        const last = i === folders.length - 1;
        const seeds = LANE_OPTIONS.filter((o) => o.folder === f && lanes.includes(o.lane)).map((o) => o.seed);
        return (
          (last ? "└── " : "├── ") + f + "/\n" +
          seeds.map((s, j) => (last ? "    " : "│   ") + (j === seeds.length - 1 ? "└── " : "├── ") + s).join("\n")
        );
      })
      .join("\n") +
    (folders.length ? "\n" : "") +
    "README.md";

  return (
    <ActionForm action={createModule} className="split" style={{ ["--side" as string]: "360px" }}>
      <Box className="pad-lg">
        <div className="form">
          <h4 style={{ margin: 0 }}>Build from scratch</h4>
          <div className="field">
            <label htmlFor="description">What does it do?</label>
            <input id="description" name="description" className="input" placeholder="e.g. Grabs the rice sack from the rack and holds it while driving" required />
            <div className="hint">Describe the job, not the part. The hub gives it its name.</div>
          </div>
          <div className="field">
            <label htmlFor="subsystem_id">Robot and subsystem</label>
            <select id="subsystem_id" name="subsystem_id" className="input" value={subsystemId} onChange={(e) => setSubsystemId(e.target.value)}>
              {[...new Set(subsystems.map((s) => s.robot))].map((r) => {
                const subs = subsystems.filter((s) => s.robot === r);
                return (
                  <optgroup key={r} label={`${r} — ${subs[0].robotName}`}>
                    {subs.map((s) => (
                      <option key={s.id} value={s.id}>
                        {r} · {s.code} — {s.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            <div className="hint">Prototypes and experiments go on RD, the R&amp;D bench. Once proven, a lead marks it and it can be socketed onto a robot.</div>
          </div>
          <div className="field">
            <label>Which lanes does it need?</label>
            <div className="chips" style={{ marginBottom: 8 }}>
              {LANE_OPTIONS.map((o) => (
                <button
                  key={o.lane}
                  type="button"
                  className="btn chip"
                  aria-pressed={lanes.includes(o.lane)}
                  onClick={() => setLanes(lanes.includes(o.lane) ? lanes.filter((l) => l !== o.lane) : [...lanes, o.lane])}
                >
                  {o.lane} · {o.label}
                </button>
              ))}
            </div>
            {lanes.map((l) => (
              <input key={l} type="hidden" name="lanes" value={l} />
            ))}
            <div className="hint">An unused lane shows as “—”; a picked lane with nothing in it gets flagged as empty. You can change this later.</div>
          </div>
          <div className="field">
            <label htmlFor="mechanism">Version 1 — how does it work?</label>
            <input id="mechanism" name="mechanism" className="input" placeholder="e.g. Two-finger claw on an MG996R servo" required />
            <div className="hint">
              Each version is one mechanism. When you switch to a different one (say, a suction cup), start v2 on the module
              page — v1 and everything filed under it stay in the history.
            </div>
          </div>
          <div className="field">
            <label>Its name</label>
            <div className="mono accent-text" style={{ fontSize: 18 }}>{code}</div>
            <div className="hint">
              Set by the hub: season · robot · subsystem · next number. Files in it are named {code}-v1-ASM, {code}-v1-FW …
            </div>
          </div>
          <div className="form-actions">
            <Submit primary pendingText="Creating…">Create {code}</Submit>
            <FormNotice />
          </div>
        </div>
      </Box>

      <div className="stack" style={{ gap: 16 }}>
        <Box className="pad">
          <h5 style={{ margin: "0 0 10px" }}>Its folder in {repo}</h5>
          <pre className="tree">{tree}</pre>
        </Box>
        <Box className="pad">
          <h5 style={{ margin: "0 0 8px" }}>Then each department starts here</h5>
          <div className="stack small" style={{ gap: 8, lineHeight: 1.5 }}>
            <div><strong>Mechanical</strong> — register the master on the drive, then upload the STEP and drawing.</div>
            <div><strong>Electronics</strong> — start the KiCad project in <span className="mono">hardware/</span>, push, export the release before the fab order.</div>
            <div><strong>Programming</strong> — <span className="mono">platformio.ini</span> and a bring-up sketch in <span className="mono">firmware/</span>, on a branch.</div>
          </div>
        </Box>
        <Box tint className="pad">
          <h5 style={{ margin: "0 0 6px" }}>One repo, not one per module</h5>
          <div className="text-muted small" style={{ lineHeight: 1.6 }}>
            A module is a folder, not a repository. A cross-module change stays in one pull request, and a junior clones
            one thing to see the whole robot.
          </div>
        </Box>
      </div>
    </ActionForm>
  );
}
