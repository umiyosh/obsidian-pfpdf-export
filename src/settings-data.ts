import { TEMPLATES, type Template } from "./convert/frontmatter";
import { DEFAULT_PFPDF_COMMAND } from "./export/pipeline";

const OUTPUT_LOCATIONS = ["ask", "note-folder", "folder"] as const;
export type OutputLocation = (typeof OUTPUT_LOCATIONS)[number];

export interface PfpdfSettings {
  command: string;
  extraArgs: string;
  template: Template;
  toc: boolean;
  outputLocation: OutputLocation;
  /** Vault-relative folder used when outputLocation is "folder". */
  outputFolder: string;
  openAfterExport: boolean;
  /** Extra PATH entries for finding Node.js, in the platform's PATH syntax. */
  extraPath: string;
  timeoutSeconds: number;
  keepWorkDir: boolean;
}

export const DEFAULT_SETTINGS: Readonly<PfpdfSettings> = {
  command: DEFAULT_PFPDF_COMMAND,
  extraArgs: "",
  template: "default",
  toc: true,
  outputLocation: "ask",
  outputFolder: "",
  openAfterExport: true,
  extraPath: "",
  // Generous so a long document with many diagrams is not cut off; users can lower it.
  timeoutSeconds: 600,
  keepWorkDir: false,
};

function pick<T>(value: unknown, guard: (v: unknown) => v is T, fallback: T): T {
  return guard(value) ? value : fallback;
}

const isString = (v: unknown): v is string => typeof v === "string";
const isBoolean = (v: unknown): v is boolean => typeof v === "boolean";
const isTimeout = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 10 && v <= 3600;
const isTemplate = (v: unknown): v is Template => TEMPLATES.some((t) => t === v);
const isLocation = (v: unknown): v is OutputLocation => OUTPUT_LOCATIONS.some((l) => l === v);

// Builds before the first release saved this default, which made the plugin download pfpdf and Chromium.
// It was never a user's choice, so it moves to the new default; a user's own npx command stays.
const LEGACY_DEFAULT_COMMAND = "npx --yes @pfnet-research/pfpdf@0.3.0";

/** Saved data comes from disk and may be from an older version or hand-edited. */
export function parseSettings(data: unknown): PfpdfSettings {
  const d: Record<string, unknown> = typeof data === "object" && data !== null ? { ...data } : {};
  const command = pick(d.command, isString, DEFAULT_SETTINGS.command);
  const replaced = command.trim() === "" || command === LEGACY_DEFAULT_COMMAND;
  return {
    command: replaced ? DEFAULT_SETTINGS.command : command,
    extraArgs: pick(d.extraArgs, isString, DEFAULT_SETTINGS.extraArgs),
    template: pick(d.template, isTemplate, DEFAULT_SETTINGS.template),
    toc: pick(d.toc, isBoolean, DEFAULT_SETTINGS.toc),
    outputLocation: pick(d.outputLocation, isLocation, DEFAULT_SETTINGS.outputLocation),
    outputFolder: pick(d.outputFolder, isString, DEFAULT_SETTINGS.outputFolder),
    openAfterExport: pick(d.openAfterExport, isBoolean, DEFAULT_SETTINGS.openAfterExport),
    extraPath: pick(d.extraPath, isString, DEFAULT_SETTINGS.extraPath),
    timeoutSeconds: pick(d.timeoutSeconds, isTimeout, DEFAULT_SETTINGS.timeoutSeconds),
    keepWorkDir: pick(d.keepWorkDir, isBoolean, DEFAULT_SETTINGS.keepWorkDir),
  };
}
