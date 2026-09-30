import type { Status } from "@/lib/types";

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

export function timeAgo(iso: string | null | undefined) {
  if (!iso) return "—";
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000;
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return "just now";
}

export function shortDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export function daysSince(iso: string | null | undefined) {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86400000;
}

export const STATUS_LABEL: Record<Status, string> = {
  concept: "Concept",
  design: "Design",
  as_built: "As-built",
  retired: "Retired",
};

export function fileSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const DISCIPLINE_LABEL = { mech: "Mechanical", elec: "Electronics", prog: "Programming" } as const;
export const DISCIPLINE_PATH = { mech: "/mechanical", elec: "/electronics", prog: "/programming" } as const;

/** vscode:// link that clones a GitHub repo. */
export function vscodeClone(repo: string) {
  return `vscode://vscode.git/clone?url=${encodeURIComponent(`https://github.com/${repo}.git`)}`;
}
