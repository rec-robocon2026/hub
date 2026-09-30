import { Box } from "@/components/ui";

/** Shows the ?gh=… result an action left after creating something that also touched GitHub. */
export function GithubNotice({ gh, ghok }: { gh?: string | string[]; ghok?: string | string[] }) {
  if (typeof gh !== "string" || !gh) return null;
  const ok = ghok === "1";
  return (
    <Box tint={ok} className="pad" style={{ marginBottom: 24 }}>
      <div className="small">
        <strong>GitHub:</strong> <span className={ok ? "" : "note-err"}>{gh}</span>
      </div>
    </Box>
  );
}
