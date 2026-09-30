// The hub names everything; people only describe. The database applies the rule (0004_naming_versions.sql);
// these helpers mirror it so forms can show the name before it's saved.
//
//   Module   RC26-R1-GRP-03            season · robot (R1, R2 … or RD) · subsystem · number
//   Version  RC26-R1-GRP-03-v2         one mechanism per version
//   Item     RC26-R1-GRP-03-v2-ASM     by kind; a second one in the same version is …-ASM2
export const NAME_RE = /^RC\d{2}-(R[1-9]|RD)-[A-Z]{3}-\d{2,}-v\d+-[A-Z]{2,6}\d*$/;

const KIND_CODE: Record<string, string> = {
  firmware: "FW",
  "test log": "LOG",
  "calibration data": "CAL",
  "tuning note": "TUNE",
  "simulation asset": "SIM",
  "helper script": "TOOL",
  schematic: "SCH",
  "pcb layout": "PCB",
  "gerber release": "GBR",
  bom: "BOM",
  "wiring diagram": "WIRE",
  datasheet: "DS",
  "cad part": "PART",
  "cad assembly": "ASM",
  "jig or fixture": "JIG",
  "photo of the built part": "PHOTO",
  "simulation mesh": "MESH",
};

export function kindCode(kind: string) {
  return KIND_CODE[kind.trim().toLowerCase()] ?? (kind.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4) || "ITEM");
}

/** RC26-R1-GRP-03 — the next module code in a subsystem. */
export function moduleCode(prefix: string, robot: string, subsystem: string, number: number) {
  return `${prefix}-${robot}-${subsystem}-${String(number).padStart(2, "0")}`;
}

/** RC26-R1-GRP-03-v2 */
export function versionCode(moduleName: string, version: number) {
  return `${moduleName}-v${version}`;
}

/** RC26-R1-GRP-03-v2-ASM — before any clash suffix, which the database adds. */
export function itemName(moduleName: string, version: number, kind: string) {
  return `${versionCode(moduleName, version)}-${kindCode(kind)}`;
}
