import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { convertDocument, type NoteInput } from "../convert/document";
import type { DocumentDefaults } from "../convert/frontmatter";
import { runCommand, splitCommand, type RunResult } from "./command";
import { notFoundMessage } from "./readiness";
import type { VaultIO } from "./vault-io";
import { WorkspaceHost } from "./workspace";

// The user installs pfpdf; the plugin never fetches it.
export const DEFAULT_PFPDF_COMMAND = "pfpdf";

export interface ExportOptions {
  command: string;
  extraArgs: string;
  defaults: DocumentDefaults;
  /** PATH for the pfpdf process. */
  searchPath: string;
  keepWorkDir: boolean;
  timeoutMs: number;
}

export interface ExportResult {
  outputPath: string;
  warnings: string[];
  /** Kept only when requested, for inspecting the generated Markdown. */
  workDir?: string;
}

export class ExportError extends Error {
  constructor(
    message: string,
    readonly log: string,
    readonly warnings: string[]
  ) {
    super(message);
    this.name = "ExportError";
  }
}

const ANSI = new RegExp(String.raw`\u001b\[[0-9;]*m`, "g");
// pfpdf warns about this on every run that does not set SOURCE_DATE_EPOCH; it is noise here.
const IGNORED_WARNINGS = [/SOURCE_DATE_EPOCH/];

function logLines(log: string): string[] {
  return log
    .replace(ANSI, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

export function pfpdfWarnings(log: string): string[] {
  return logLines(log)
    .filter((l) => /^pfpdf: warn(?:ing)?:/i.test(l))
    .map((l) => l.replace(/^pfpdf: warn(?:ing)?:\s*/i, ""))
    .filter((l) => !IGNORED_WARNINGS.some((re) => re.test(l)));
}

/** Picks the lines a user can act on from a failed run. */
export function failureMessage(result: RunResult, command: string): string {
  if (result.startError) {
    if (/ENOENT/.test(result.startError)) return notFoundMessage(command);
    return `Could not start "${command}" (${result.startError}). Check the pfpdf command and the Node.js path in the plugin settings.`;
  }
  if (result.timedOut) return "pfpdf timed out. Increase the timeout in the plugin settings.";
  const lines = logLines(result.output).filter((l) => !/^npm (?:warn|notice)/i.test(l));
  const errors = lines.filter((l) => /error/i.test(l));
  const detail = (errors.length > 0 ? errors : lines).slice(-5).join("\n");
  return `pfpdf exited with code ${String(result.exitCode)}${detail ? `:\n${detail}` : ""}`;
}

function buildArgv(options: ExportOptions, input: string, output: string): string[] {
  return [
    ...splitCommand(options.command),
    "--input",
    input,
    "--output",
    output,
    ...splitCommand(options.extraArgs),
  ];
}

export async function exportNote(
  io: VaultIO,
  note: NoteInput,
  outputPath: string,
  options: ExportOptions
): Promise<ExportResult> {
  const workDir = await mkdtemp(join(tmpdir(), "pfpdf-export-"));
  try {
    await mkdir(join(workDir, "assets"));
    const host = new WorkspaceHost(io, workDir);
    const input = join(workDir, "document.md");
    await writeFile(input, await convertDocument(note, host, options.defaults), "utf8");
    await mkdir(dirname(outputPath), { recursive: true });
    const result = await runCommand(buildArgv(options, input, outputPath), {
      cwd: workDir,
      env: { ...process.env, PATH: options.searchPath },
      timeoutMs: options.timeoutMs,
    });
    const warnings = [...host.warnings, ...pfpdfWarnings(result.output)];
    if (result.exitCode !== 0) {
      throw new ExportError(failureMessage(result, options.command), result.output, warnings);
    }
    return { outputPath, warnings, workDir: options.keepWorkDir ? workDir : undefined };
  } finally {
    if (!options.keepWorkDir) await rm(workDir, { recursive: true, force: true });
  }
}
