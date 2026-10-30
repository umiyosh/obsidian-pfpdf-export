import spawn from "cross-spawn";

/** Splits a command line on whitespace, honouring single and double quotes. */
export function splitCommand(command: string): string[] {
  const args: string[] = [];
  const re = /"((?:\\.|[^"\\])*)"|'([^']*)'|(\S+)/g;
  for (const m of command.matchAll(re)) {
    args.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, "$1") : (m[2] ?? m[3] ?? ""));
  }
  return args;
}

interface SearchPathParts {
  extra: string;
  loginShell: string | null;
  current: string | undefined;
  home: string;
  platform: string;
}

/**
 * Apps launched from the Dock or Start menu get a minimal PATH that usually lacks Node.js,
 * so the shell's PATH and the common Node.js install locations are added in front of it.
 */
export function buildSearchPath(parts: SearchPathParts): string {
  const sep = parts.platform === "win32" ? ";" : ":";
  const common =
    parts.platform === "win32"
      ? []
      : [
          "/opt/homebrew/bin",
          "/usr/local/bin",
          `${parts.home}/.volta/bin`,
          `${parts.home}/.nodebrew/current/bin`,
          `${parts.home}/.local/share/mise/shims`,
          `${parts.home}/.asdf/shims`,
          `${parts.home}/.local/bin`,
          "/usr/bin",
          "/bin",
        ];
  const entries = [parts.extra, parts.loginShell ?? "", parts.current ?? ""]
    .flatMap((p) => p.split(sep))
    .concat(common)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  return [...new Set(entries)].join(sep);
}

const PATH_MARKER = "__PFPDF_PATH__";

export function parseLoginShellOutput(output: string): string | null {
  const start = output.indexOf(PATH_MARKER);
  const end = output.indexOf(PATH_MARKER, start + PATH_MARKER.length);
  if (start < 0 || end < 0) return null;
  return output.slice(start + PATH_MARKER.length, end) || null;
}

/** Reads PATH from the user's login shell; null when it cannot be determined. */
export async function loginShellPath(shell: string, timeoutMs = 5000): Promise<string | null> {
  const script = `printf '${PATH_MARKER}%s${PATH_MARKER}' "$PATH"`;
  const result = await runCommand([shell, "-ilc", script], { timeoutMs });
  return result.exitCode === 0 ? parseLoginShellOutput(result.output) : null;
}

export interface RunOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs: number;
}

export interface RunResult {
  /** null when the process could not start or was killed. */
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  startError?: string;
}

// Enough to keep the tail of a long pfpdf log, where errors are reported.
const MAX_OUTPUT = 200_000;

export function runCommand(argv: readonly string[], options: RunOptions): Promise<RunResult> {
  const [command = "", ...args] = argv;
  // cross-spawn starts Windows .cmd shims such as npx with every argument escaped for cmd.exe.
  // A plain `shell: true` would let a note or folder name like "a&b" run as a second command.
  return new Promise((resolve) => {
    let output = "";
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: options.timeoutMs,
      killSignal: "SIGTERM",
    });
    const append = (chunk: Buffer) => {
      output = (output + chunk.toString("utf8")).slice(-MAX_OUTPUT);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", (error) => {
      resolve({ exitCode: null, output, timedOut: false, startError: error.message });
    });
    // A signal without an exit code means the process was killed, here by the timeout.
    child.on("close", (code, signal) => {
      resolve({ exitCode: code, output, timedOut: code === null && signal !== null });
    });
  });
}
