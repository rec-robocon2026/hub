// RC26-R1-DRV-WHEELMOD-A-v3: season · robot (R1, R2 … or RD for R&D) · subsystem code · part · optional variant · revision.
export const NAME_RE = /^RC\d{2}-(R[1-9]|RD)-[A-Z]{3}-[A-Z0-9]{2,14}(-[A-Z])?-v\d+$/;

export type NameCheck = { ok: boolean; problems: string[] };

/** prefix is season + robot, e.g. "RC26-R1"; code is the subsystem, e.g. "DRV". */
export function checkName(name: string, prefix?: string, code?: string): NameCheck {
  const typed = name.trim();
  if (!typed) return { ok: false, problems: [] };

  const problems: string[] = [];
  if (!/^RC\d{2}-/.test(typed)) problems.push(`start with the season and robot, e.g. ${prefix ?? "RC26-R1"}-`);
  else if (!/^RC\d{2}-(R[1-9]|RD)-/.test(typed)) problems.push("robot code after the season — R1, R2 … or RD");
  else if (prefix && !typed.startsWith(prefix + "-")) problems.push(`this module is on ${prefix}`);
  if (!/^RC\d{2}-(R[1-9]|RD)-[A-Z]{3}-/.test(typed)) problems.push(`three-letter subsystem code, e.g. -${code ?? "DRV"}-`);
  else if (code && typed.split("-")[2] !== code) problems.push(`this module is under ${code}`);
  if (!/-v\d+$/.test(typed)) problems.push("end with a revision, e.g. -v1");
  if (/[a-z]/.test(typed.replace(/-v\d+$/, ""))) problems.push("uppercase only");
  if (/\s/.test(typed)) problems.push("no spaces — use hyphens");
  if (/FINAL/i.test(typed)) problems.push('no "final" — use a revision');

  const ok = NAME_RE.test(typed) && problems.length === 0;
  return { ok, problems: ok ? [] : problems.length ? problems : ["does not match the pattern"] };
}

/** The revision number at the end of a name, if any. */
export function revisionOf(name: string): number | null {
  const m = /-v(\d+)$/.exec(name.trim());
  return m ? Number(m[1]) : null;
}

export function slugify(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
