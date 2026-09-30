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
    example: "RC26-R1-DRV-01-v1-FW",
    rule: "season · robot · subsystem · module number · version · kind. Set by the hub.",
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
    example: "RC26-R1-CTL-02-v2-PCB",
    rule: "season · robot · subsystem · module number · version · kind. Set by the hub.",
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
    example: "RC26-R1-GRP-03-v2-ASM",
    rule: "season · robot · subsystem · module number · version · kind. Set by the hub.",
  },
};

export const LOCATION_PLACEHOLDER: Record<Location, string> = {
  github: "https://github.com/rec-robocon2026/RC26/tree/main/R1/…",
  drive: "/RC26/R1/GRP/RC26-R1-GRP-03-v2/",
  storage: "",
  link: "https://… datasheet, supplier page, video",
};
