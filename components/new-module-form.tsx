"use client";

import { useState } from "react";
import { createModule } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box } from "@/components/ui";
import { slugify } from "@/lib/naming";
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
  taken,
}: {
  subsystems: { id: string; code: string; name: string; robot: string; robotName: string }[];
  defaultSubsystem?: string;
  repo: string;
  taken: string[];
}) {
  const [name, setName] = useState("");
  const [subsystemId, setSubsystemId] = useState(defaultSubsystem ?? subsystems[0].id);
  const [lanes, setLanes] = useState<Lane[]>(["SCH", "PCB", "FW", "MECH"]);
  const slug = slugify(name);
  const clash = slug && taken.includes(`${subsystemId}/${slug}`);
  const robot = subsystems.find((s) => s.id === subsystemId)?.robot ?? "R1";

  const folders = [...new Set(LANE_OPTIONS.filter((o) => lanes.includes(o.lane)).map((o) => o.folder))];
  const tree =
    `${robot}/${slug || "your-module"}/\n` +
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
            <label htmlFor="name">What is it?</label>
            <input id="name" name="name" className="input" placeholder="e.g. Gripper Controller" value={name} onChange={(e) => setName(e.target.value)} required />
            <div className="hint">
              Name it after the physical block, not the discipline. “Gripper Controller”, not “Gripper PCB”.
              {clash && <span className="note-err"> A module with this name already exists in that subsystem.</span>}
            </div>
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
            <label htmlFor="description">One line about it</label>
            <input id="description" name="description" className="input" placeholder="Splits the CAN bus to every board, with termination." />
          </div>
          <div className="form-actions">
            <Submit primary pendingText="Creating…" disabled={!!clash}>Create module</Submit>
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
