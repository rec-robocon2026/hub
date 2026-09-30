import type { Discipline, Lane, Location } from "@/lib/types";

export type KindOption = { label: string; lane: Lane | null };

export type DisciplineConfig = {
  discipline: Discipline;
  kinds: KindOption[];
  locations: Location[];
  defaultLocation: Location;
  fileHint: string;
  accept?: string;
  example: string;
  rule: string;
};

export const LOCATION_LABEL: Record<Location, string> = {
  github: "GitHub",
  drive: "DRIVE-A / B",
  storage: "Hub storage",
  link: "External link",
};

export const DISCIPLINES: Record<Discipline, DisciplineConfig> = {
  prog: {
    discipline: "prog",
    kinds: [
      { label: "Firmware", lane: "FW" },
      { label: "Test log", lane: "FW" },
      { label: "Calibration data", lane: "FW" },
      { label: "Tuning note", lane: "FW" },
      { label: "Simulation asset", lane: "SIM" },
      { label: "Helper script", lane: null },
    ],
    locations: ["github", "storage", "link"],
    defaultLocation: "github",
    fileHint: "log · CSV · rosbag summary · screenshot",
    example: "RC26-DRV-PIDTUNE-v1",
    rule: "season · subsystem code · part or module · variant (optional) · revision. Uppercase, no spaces, no “final”.",
  },
  elec: {
    discipline: "elec",
    kinds: [
      { label: "Schematic", lane: "SCH" },
      { label: "PCB layout", lane: "PCB" },
      { label: "Gerber release", lane: "PCB" },
      { label: "BOM", lane: "PCB" },
      { label: "Wiring diagram", lane: "SCH" },
      { label: "Datasheet", lane: null },
    ],
    locations: ["github", "storage", "link"],
    defaultLocation: "github",
    fileHint: "Gerber zip · schematic PDF · BOM · datasheet",
    example: "RC26-CTL-CANHUB-v2",
    rule: "season · subsystem code · board · revision. Bump the revision on every fab order, never reuse one.",
  },
  mech: {
    discipline: "mech",
    kinds: [
      { label: "CAD part", lane: "MECH" },
      { label: "CAD assembly", lane: "MECH" },
      { label: "Jig or fixture", lane: "MECH" },
      { label: "Photo of the built part", lane: "MECH" },
      { label: "Simulation mesh", lane: "SIM" },
    ],
    locations: ["drive", "storage"],
    defaultLocation: "drive",
    fileHint: "STEP · STL · PDF drawing · photo",
    accept: ".step,.stp,.stl,.pdf,.png,.jpg,.jpeg,.dae,.obj",
    example: "RC26-DRV-WHEELMOD-A-v3",
    rule: "season · subsystem code · part · variant (optional) · revision. Uppercase, no spaces, no “final”.",
  },
};

export const LOCATION_PLACEHOLDER: Record<Location, string> = {
  github: "https://github.com/rec-robocon2026/rc26-robot/tree/main/modules/…",
  drive: "/RC26/DRV/WHEELMOD/",
  storage: "",
  link: "https://… datasheet, supplier page, video",
};
