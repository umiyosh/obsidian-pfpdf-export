import { FenceTracker } from "./blocks";

const CALLOUT_START = /^ {0,3}> ?\[!([^\]\s]+)\]([+-]?)[ \t]*(.*)$/;
const QUOTED = /^ {0,3}>/;

// Obsidian aliases share the colour of their canonical type.
const FAMILY: Record<string, string> = {
  note: "note",
  info: "note",
  todo: "note",
  abstract: "abstract",
  summary: "abstract",
  tldr: "abstract",
  tip: "tip",
  hint: "tip",
  important: "tip",
  success: "success",
  check: "success",
  done: "success",
  question: "question",
  help: "question",
  faq: "question",
  warning: "warning",
  caution: "warning",
  attention: "warning",
  failure: "danger",
  fail: "danger",
  missing: "danger",
  danger: "danger",
  error: "danger",
  bug: "danger",
  example: "example",
  quote: "quote",
  cite: "quote",
};

export const CALLOUT_STYLE = `<style>
.pfpdf-callout { margin: 1em 0; padding: 0.2em 1em; border-left: 4px solid #086ddd; background: rgba(8, 109, 221, 0.07); border-radius: 4px; }
.pfpdf-callout-title { font-weight: bold; color: #086ddd; }
.pfpdf-callout-abstract { border-left-color: #00a3a3; background: rgba(0, 163, 163, 0.07); }
.pfpdf-callout-abstract > .pfpdf-callout-title { color: #00a3a3; }
.pfpdf-callout-tip, .pfpdf-callout-success { border-left-color: #08a35a; background: rgba(8, 163, 90, 0.07); }
.pfpdf-callout-tip > .pfpdf-callout-title, .pfpdf-callout-success > .pfpdf-callout-title { color: #08a35a; }
.pfpdf-callout-question, .pfpdf-callout-warning { border-left-color: #d97706; background: rgba(217, 119, 6, 0.08); }
.pfpdf-callout-question > .pfpdf-callout-title, .pfpdf-callout-warning > .pfpdf-callout-title { color: #b45309; }
.pfpdf-callout-danger { border-left-color: #dc2626; background: rgba(220, 38, 38, 0.07); }
.pfpdf-callout-danger > .pfpdf-callout-title { color: #b91c1c; }
.pfpdf-callout-example { border-left-color: #7c3aed; background: rgba(124, 58, 237, 0.07); }
.pfpdf-callout-example > .pfpdf-callout-title { color: #6d28d9; }
.pfpdf-callout-quote { border-left-color: #6b7280; background: rgba(107, 114, 128, 0.08); }
.pfpdf-callout-quote > .pfpdf-callout-title { color: #4b5563; }
</style>`;

function titleCase(type: string): string {
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

function renderCallout(type: string, title: string, body: string[]): string[] {
  const family = FAMILY[type.toLowerCase()] ?? "note";
  // Markdown is only parsed inside an HTML block after a blank line, hence the spacing.
  const out = [
    `<div class="pfpdf-callout pfpdf-callout-${family}">`,
    `<div class="pfpdf-callout-title">`,
    "",
    title || titleCase(type),
    "",
    "</div>",
  ];
  const inner = convertCallouts(body);
  if (inner.some((l) => l.trim() !== "")) out.push("", ...inner);
  out.push("", "</div>");
  return out;
}

/**
 * Rewrites Obsidian callouts ("> [!note] Title") into styled HTML blocks, because pfpdf only
 * renders plain GFM blockquotes. Nested callouts are handled recursively.
 */
export function convertCallouts(lines: string[]): string[] {
  const out: string[] = [];
  const fences = new FenceTracker();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (fences.inFence || !CALLOUT_START.test(line)) {
      fences.feed(line);
      out.push(line);
      i++;
      continue;
    }
    const [, type = "note", , title = ""] = line.match(CALLOUT_START) ?? [];
    const body: string[] = [];
    i++;
    while (i < lines.length && QUOTED.test(lines[i] ?? "")) {
      body.push((lines[i] ?? "").replace(/^ {0,3}> ?/, ""));
      i++;
    }
    if (out.length > 0 && (out[out.length - 1] ?? "").trim() !== "") out.push("");
    out.push(...renderCallout(type, title.trim(), body));
    if (i < lines.length && (lines[i] ?? "").trim() !== "") out.push("");
  }
  return out;
}
