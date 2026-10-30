import { FenceTracker, stripFrontMatter } from "./blocks";
import { CALLOUT_STYLE, convertCallouts } from "./callout";
import type { BodyContext } from "./context";
import { buildFrontMatter, type DocumentDefaults, type FrontMatter } from "./frontmatter";
import { transformInline, type CommentState } from "./inline";
import type { ConvertHost } from "./types";

const JOB_TOKEN = /(\d+)/g;

interface SharedState {
  host: ConvertHost;
  footnotes: string[];
}

export interface NoteInput {
  path: string;
  content: string;
  /** Used when the front matter has no title, since pfpdf requires one. */
  title: string;
  /** Parsed front matter as Obsidian's metadata cache provides it. */
  frontmatter?: FrontMatter;
}

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n?/g, "\n");
}

/** Returns the rest of a line after a multi-line comment closes, or null while it stays open. */
function leaveComment(line: string, comments: CommentState): string | null {
  const end = line.indexOf("%%");
  if (end < 0) return null;
  comments.inComment = false;
  const rest = line.slice(end + 2);
  return rest.trim() === "" ? null : rest;
}

function transformLines(lines: readonly string[], ctx: BodyContext): string[] {
  const out: string[] = [];
  const fences = new FenceTracker();
  const comments: CommentState = { inComment: false };
  let inMath = false;
  for (const raw of lines) {
    const line = comments.inComment ? leaveComment(raw, comments) : raw;
    if (line === null) continue;
    if (inMath || fences.feed(line) || line.trim() === "$$") {
      if (line.trim() === "$$" && !fences.inFence) inMath = !inMath;
      out.push(line);
      continue;
    }
    const converted = transformInline(line, ctx, comments);
    // A line that held nothing but a comment disappears instead of leaving a blank line.
    if (converted.trim() === "" && line.includes("%%")) continue;
    out.push(converted);
  }
  return out;
}

async function renderBody(
  text: string,
  sourcePath: string,
  chain: readonly string[],
  shared: SharedState
): Promise<string> {
  const jobs: Array<() => Promise<string>> = [];
  const ctx: BodyContext = {
    host: shared.host,
    sourcePath,
    chain,
    footnotes: shared.footnotes,
    defer(job) {
      jobs.push(job);
      return `${jobs.length - 1}`;
    },
    renderNested: (nested, path, key) => renderBody(nested, path, [...chain, key], shared),
  };
  const lines = convertCallouts(normalizeNewlines(text).split("\n"));
  const out = transformLines(lines, ctx).join("\n");
  // Sequential on purpose: assets are numbered in document order, which keeps output stable.
  const results: string[] = [];
  for (const job of jobs) results.push(await job());
  return out.replace(JOB_TOKEN, (_m, i: string) => results[Number(i)] ?? "");
}

/** Converts Obsidian-flavoured Markdown into the GFM dialect pfpdf renders. */
export async function convertBody(
  text: string,
  host: ConvertHost,
  sourcePath: string
): Promise<string> {
  const shared: SharedState = { host, footnotes: [] };
  const body = await renderBody(
    stripFrontMatter(normalizeNewlines(text)),
    sourcePath,
    [`${sourcePath}#`],
    shared
  );
  if (shared.footnotes.length === 0) return body;
  const defs = shared.footnotes.map((note, i) => `[^pfpdf-${i + 1}]: ${note}`);
  return `${body}\n\n${defs.join("\n")}`;
}

export async function convertDocument(
  note: NoteInput,
  host: ConvertHost,
  defaults: DocumentDefaults
): Promise<string> {
  const frontMatter = await buildFrontMatter(note.frontmatter ?? {}, note.title, defaults, {
    warn: (message) => host.warn(message),
    copyAsset: async (path) => {
      const file = host.resolve(path, note.path);
      return file ? host.addLocalAsset(file) : null;
    },
  });
  const body = (await convertBody(note.content, host, note.path)).trim();
  const style = body.includes('class="pfpdf-callout') ? CALLOUT_STYLE : "";
  const parts = [`---\n${frontMatter.join("\n")}\n---`, style, body].filter((p) => p !== "");
  return `${parts.join("\n\n")}\n`;
}
