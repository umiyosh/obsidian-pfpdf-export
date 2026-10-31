import { runCommand, splitCommand, type RunResult } from "./command";

export const INSTALL_COMMAND = "npm install -g @pfnet-research/pfpdf@0.3.0";

export type Readiness = { ok: true; version: string } | { ok: false; message: string };

export interface ReadinessOptions {
  command: string;
  /** PATH for the pfpdf process. */
  searchPath: string;
  timeoutMs: number;
}

export function notFoundMessage(command: string): string {
  return `"${command}" was not found. Install pfpdf with "${INSTALL_COMMAND}" (Node.js 22.12 or later), or set the pfpdf command in the plugin settings.`;
}

export function readinessFromVersion(result: RunResult, command: string): Readiness {
  if (result.startError) {
    if (/ENOENT/.test(result.startError)) return { ok: false, message: notFoundMessage(command) };
    return { ok: false, message: `Could not start "${command}" (${result.startError}).` };
  }
  if (result.timedOut) return { ok: false, message: `"${command} --version" timed out.` };
  if (result.exitCode !== 0) {
    return { ok: false, message: `pfpdf could not run: ${result.output.trim().slice(-300)}` };
  }
  return { ok: true, version: result.output.trim().split("\n").pop() ?? "" };
}

/** Runs `pfpdf --version`, which is quick, so a missing pfpdf is reported before the save dialog. */
export async function checkReadiness(options: ReadinessOptions): Promise<Readiness> {
  const result = await runCommand([...splitCommand(options.command), "--version"], {
    env: { ...process.env, PATH: options.searchPath },
    timeoutMs: options.timeoutMs,
  });
  return readinessFromVersion(result, options.command);
}
