interface Fence {
  char: string;
  length: number;
}

/** Strips list indentation and blockquote markers so fences inside callouts are detected too. */
function stripContainer(line: string): string {
  return line.replace(/^[ \t]*(?:>[ \t]?)*[ \t]*/, "");
}

/** Tracks fenced code blocks line by line; Obsidian syntax inside them must be left untouched. */
export class FenceTracker {
  private fence: Fence | null = null;

  get inFence(): boolean {
    return this.fence !== null;
  }

  /** Returns true when the line opens, closes or sits inside a fenced code block. */
  feed(line: string): boolean {
    const body = stripContainer(line);
    if (this.fence) {
      const close = body.match(/^(`{3,}|~{3,})\s*$/);
      if (close?.[1] && close[1][0] === this.fence.char && close[1].length >= this.fence.length) {
        this.fence = null;
      }
      return true;
    }
    const open = body.match(/^(`{3,}|~{3,})(.*)$/);
    if (open?.[1] && !(open[1][0] === "`" && open[2]?.includes("`"))) {
      this.fence = { char: open[1][0] ?? "`", length: open[1].length };
      return true;
    }
    return false;
  }
}

export function stripFrontMatter(content: string): string {
  const m = content.match(/^---[ \t]*\n[\s\S]*?\n(?:---|\.\.\.)[ \t]*(?:\n|$)/);
  return m ? content.slice(m[0].length) : content;
}

function headingLevel(line: string): number {
  const m = line.match(/^(#{1,6})[ \t]+/);
  return m?.[1] ? m[1].length : 0;
}

function normalizeHeading(text: string): string {
  return text
    .replace(/^#{1,6}[ \t]+/, "")
    .replace(/[ \t]+#+[ \t]*$/, "")
    .trim()
    .toLowerCase();
}

/** Returns the lines of the section under the heading, including the heading itself. */
function extractHeadingSection(lines: string[], subpath: string): string[] | null {
  // "A#B" addresses B nested under A; matching on the last segment is enough in practice.
  const wanted = normalizeHeading(subpath.split("#").pop() ?? "");
  const fences = new FenceTracker();
  let start = -1;
  let level = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (fences.feed(line)) continue;
    const lv = headingLevel(line);
    if (lv === 0) continue;
    if (start < 0) {
      if (normalizeHeading(line) === wanted) {
        start = i;
        level = lv;
      }
    } else if (lv <= level) {
      return lines.slice(start, i);
    }
  }
  return start < 0 ? null : lines.slice(start);
}

function extractBlock(lines: string[], id: string): string[] | null {
  const marker = new RegExp(`(?:^|\\s)\\^${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`);
  const idx = lines.findIndex((l) => marker.test(l));
  if (idx < 0) return null;
  const line = lines[idx] ?? "";
  // A list item carries its own id; a paragraph or a trailing id line refers to the whole block.
  if (/^\s*(?:[-*+]|\d+[.)])\s/.test(line)) return [line];
  const standalone = line.trim().startsWith("^");
  const end = standalone ? idx - 1 : idx;
  let start = end;
  while (start > 0 && (lines[start - 1] ?? "").trim() !== "") start--;
  return lines.slice(start, end + 1);
}

/** Picks the part of a note addressed by "#Heading" or "#^block"; null when it does not exist. */
export function extractSubpath(content: string, subpath: string): string | null {
  const lines = stripFrontMatter(content).split("\n");
  if (!subpath) return lines.join("\n");
  const picked = subpath.startsWith("^")
    ? extractBlock(lines, subpath.slice(1))
    : extractHeadingSection(lines, subpath);
  return picked ? picked.join("\n") : null;
}
