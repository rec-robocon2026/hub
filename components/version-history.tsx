import { setCurrentVersion, startVersion, updateVersion } from "@/app/(hub)/actions";
import { ActionForm, FormNotice, Submit } from "@/components/action-form";
import { Box, Tag } from "@/components/ui";
import { displayName } from "@/lib/auth";
import { shortDate } from "@/lib/format";
import { versionCode } from "@/lib/naming";
import type { Member, ModuleVersion } from "@/lib/types";

/** One row per mechanism tried, newest first: what it was, why it changed, how it went. */
export function VersionHistory({
  moduleId,
  moduleName,
  current,
  versions,
  itemCount,
  people,
  editable,
}: {
  moduleId: string;
  moduleName: string;
  current: number;
  versions: ModuleVersion[];
  itemCount: Map<number, number>;
  people: Map<string, Member>;
  editable: boolean;
}) {
  const newest = Math.max(0, ...versions.map((v) => v.number));
  const latest = versions.find((v) => v.number === newest);

  return (
    <section style={{ marginBottom: 40 }}>
      <h4 style={{ margin: "0 0 6px" }}>Versions — one per mechanism</h4>
      <p className="text-muted small" style={{ margin: "0 0 14px" }}>
        When the mechanism changes, start a new version. Older versions and everything filed under them stay here as history.
      </p>

      <div className="stack" style={{ gap: 10 }}>
        {[...versions].reverse().map((v) => {
          const isCurrent = v.number === current;
          return (
            <Box key={v.id} tint={isCurrent} className="pad">
              <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="row" style={{ gap: 8, marginBottom: 4 }}>
                    <span className="mono" style={{ fontWeight: 600 }}>{versionCode(moduleName, v.number)}</span>
                    {isCurrent && <Tag kind="accent">CURRENT</Tag>}
                    <span className="text-muted small">
                      {itemCount.get(v.number) ?? 0} items · {shortDate(v.created_at)}
                      {v.created_by ? ` · ${displayName(people.get(v.created_by))}` : ""}
                    </span>
                  </div>
                  <div style={{ fontSize: 15 }}>{v.mechanism}</div>
                  {v.why && <div className="text-muted small" style={{ marginTop: 4 }}>Why: {v.why}</div>}
                  {v.outcome && <div className="small" style={{ marginTop: 4 }}>How it went: {v.outcome}</div>}
                </div>
                {editable && !isCurrent && (
                  <form action={setCurrentVersion}>
                    <input type="hidden" name="module_id" value={moduleId} />
                    <input type="hidden" name="number" value={v.number} />
                    <button className="btn btn-ghost" type="submit" style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                      Make current
                    </button>
                  </form>
                )}
              </div>
              {editable && (
                <details style={{ marginTop: 8 }}>
                  <summary className="text-muted small" style={{ cursor: "pointer" }}>Edit v{v.number}</summary>
                  <ActionForm action={updateVersion} className="form" style={{ gap: 8, marginTop: 8 }}>
                    <input type="hidden" name="version_id" value={v.id} />
                    <input name="mechanism" className="input" defaultValue={v.mechanism} required aria-label="Mechanism" />
                    <input name="why" className="input" defaultValue={v.why ?? ""} placeholder="Why this version (what changed from the one before)" />
                    <input name="outcome" className="input" defaultValue={v.outcome ?? ""} placeholder="How it went — what the next team should know" />
                    <div className="row">
                      <Submit>Save</Submit>
                      <FormNotice />
                    </div>
                  </ActionForm>
                </details>
              )}
            </Box>
          );
        })}
      </div>

      {editable && (
        <details style={{ marginTop: 14 }}>
          <summary className="btn btn-secondary" style={{ display: "inline-flex" }}>
            Start v{newest + 1} — a new mechanism
          </summary>
          <Box className="pad" style={{ marginTop: 10 }}>
            <ActionForm action={startVersion} className="form" style={{ gap: 10 }}>
              <input type="hidden" name="module_id" value={moduleId} />
              <div className="field">
                <label htmlFor="new-mechanism">How does v{newest + 1} work?</label>
                <input id="new-mechanism" name="mechanism" className="input" placeholder="e.g. Suction cup on a 12 V vacuum pump" required />
              </div>
              <div className="field">
                <label htmlFor="new-why">Why change?</label>
                <input id="new-why" name="why" className="input" placeholder="e.g. The claw dropped sacks heavier than 1 kg" />
              </div>
              {latest && !latest.outcome && (
                <div className="field">
                  <label htmlFor="prev-outcome">How did v{latest.number} go?</label>
                  <input id="prev-outcome" name="previous_outcome" className="input" placeholder={`What worked, what didn't — kept on v${latest.number} for the next team`} />
                </div>
              )}
              <div className="hint" style={{ marginTop: 0 }}>
                v{newest + 1} becomes current: new items are named {versionCode(moduleName, newest + 1)}-…
              </div>
              <div className="row">
                <Submit primary pendingText="Starting…">Start v{newest + 1}</Submit>
                <FormNotice />
              </div>
            </ActionForm>
          </Box>
        </details>
      )}
    </section>
  );
}
