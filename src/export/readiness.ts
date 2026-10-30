import { runCommand, splitCommand, type RunResult } from "./command";

export const INSTALL_COMMAND = "npm install -g @pfnet-research/pfpdf@0.3.0";

// --doctor launches the browser once, which takes a few seconds.
const DOCTOR_TIMEOUT_MS = 60_000;

export type Readiness = { ok: true } | { ok: false; message: string };

export interface ReadinessOptions {
  command: string;
  extraArgs: string;
  /** PATH for the pfpdf process. */
  searchPath: string;
}

interface DoctorCheck {
  id: string;
  status: string;
  message: string;
}

export function notFoundMessage(command: string): string {
  return `"${command}" was not found. Install pfpdf with "${INSTALL_COMMAND}" (Node.js 22.12 or later), or set the pfpdf command in the plugin settings.`;
}

// Directory policy forbids a plugin from installing its dependencies, so the browser that pfpdf
// would download on its first conversion has to be fetched by the user outside Obsidian.
const BROWSER_MISSING =
  'pfpdf has not downloaded its browser yet, and this plugin does not download it. Convert any Markdown file once in a terminal, for example "pfpdf --input note.md --output note.pdf", then export again.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCheck(value: unknown): value is DoctorCheck {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.status === "string" &&
    typeof value.message === "string"
  );
}

/** pfpdf prints the report as one JSON line; warnings may surround it. */
function doctorChecks(output: string): DoctorCheck[] | null {
  for (const line of output.split("\n")) {
    if (!line.trimStart().startsWith("{")) continue;
    try {
      const report: unknown = JSON.parse(line);
      if (isRecord(report) && report.command === "doctor" && Array.isArray(report.checks)) {
        return report.checks.filter(isCheck);
      }
    } catch {
      // Not the report line; keep looking.
    }
  }
  return null;
}

function browserProblem(browser: DoctorCheck | undefined): string | null {
  if (browser?.status === "pass") return null;
  if (browser?.status === "warning" && /not installed/i.test(browser.message)) {
    return BROWSER_MISSING;
  }
  return `pfpdf cannot use its browser: ${browser?.message ?? "pfpdf --doctor did not check it"}`;
}

export function readinessFromDoctor(result: RunResult, command: string): Readiness {
  if (result.startError) {
    if (/ENOENT/.test(result.startError)) return { ok: false, message: notFoundMessage(command) };
    return { ok: false, message: `Could not start "${command}" (${result.startError}).` };
  }
  if (result.timedOut) return { ok: false, message: "pfpdf --doctor timed out." };
  const checks = doctorChecks(result.output);
  if (!checks) {
    return {
      ok: false,
      message: `Could not read the result of "${command} --doctor". This plugin needs pfpdf 0.3.0 or later.`,
    };
  }
  const browser = browserProblem(checks.find((c) => c.id === "browser"));
  if (browser) return { ok: false, message: browser };
  const failed = checks.filter((c) => c.status === "fail").map((c) => c.message);
  if (failed.length > 0) return { ok: false, message: `pfpdf is not ready: ${failed.join("; ")}` };
  return { ok: true };
}

/** Asks pfpdf whether it can convert right now without downloading anything first. */
export async function checkReadiness(options: ReadinessOptions): Promise<Readiness> {
  const argv = [...splitCommand(options.command), "--doctor", ...splitCommand(options.extraArgs)];
  const result = await runCommand(argv, {
    env: { ...process.env, PATH: options.searchPath },
    timeoutMs: DOCTOR_TIMEOUT_MS,
  });
  return readinessFromDoctor(result, options.command);
}
