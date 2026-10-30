import type { BodyContext } from "./context";
import { embedMarkdownImage, embedWiki, rewriteRawImage } from "./embeds";
import { isExternalUrl, parseWikiInner, unwrapDestination, wikiDisplayText } from "./links";

// Code spans and inline math are opaque: Obsidian syntax inside them must survive verbatim.
const PROTECTED =
  /(?<!`)(`+)(?!`)[\s\S]*?[^`]\1(?!`)|(?<![\\$])\$(?![\s$])(?:\\.|[^$\\\n])+?(?<!\s)\$(?!\$)/g;
const SLOT = /(\d+)/g;

const DEST = String.raw`(<[^>\n]*>|[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:\s+(?:"[^"]*"|'[^']*'))?`;
const WIKI = /(!?)\[\[([^[\]\n]+?)\]\]/g;
const MD_IMAGE = new RegExp(String.raw`!\[((?:\\.|[^\]\\\n])*)\]\(\s*${DEST}\s*\)`, "g");
const MD_LINK = new RegExp(String.raw`(?<!!)\[((?:\\.|[^\]\\\n])*)\]\(\s*${DEST}\s*\)`, "g");
const RAW_IMG = /<img\b[^>]*>/gi;
const HIGHLIGHT = /==(?![\s=])(.+?)(?<![\s=])==/g;
const INLINE_FOOTNOTE = /\^\[([^[\]\n]+)\]/g;
const BLOCK_ID = /(?:^|\s+)\^[A-Za-z0-9-]+\s*$/;

export interface CommentState {
  inComment: boolean;
}

function protect(line: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const text = line.replace(PROTECTED, (m) => {
    slots.push(m);
    return `${slots.length - 1}`;
  });
  return { text, slots };
}

function restore(text: string, slots: readonly string[]): string {
  return text.replace(SLOT, (_m, i: string) => slots[Number(i)] ?? "");
}

/** Removes "%%" comments; an unmatched opener leaves the comment open for the following lines. */
function stripComments(text: string, state: CommentState): string {
  let out = "";
  let rest = text;
  for (;;) {
    const i = rest.indexOf("%%");
    if (i < 0) return state.inComment ? out : out + rest;
    if (!state.inComment) out += rest.slice(0, i);
    state.inComment = !state.inComment;
    rest = rest.slice(i + 2);
  }
}

// `u` restores protected spans in values handed to deferred jobs, whose output is not restored later.
type Step = (text: string, ctx: BodyContext, u: (s: string) => string) => string;

const STEPS: Step[] = [
  (t, ctx, u) =>
    t.replace(WIKI, (_m, bang: string, inner: string) =>
      bang ? ctx.defer(() => embedWiki(u(inner), ctx)) : wikiDisplayText(parseWikiInner(inner))
    ),
  (t, ctx, u) =>
    t.replace(MD_IMAGE, (_m, alt: string, dest: string) =>
      ctx.defer(() => embedMarkdownImage(u(alt), u(dest), ctx))
    ),
  // pfpdf rejects relative links that point outside the document, so only URLs stay links.
  (t) =>
    t.replace(MD_LINK, (m, text: string, dest: string) =>
      isExternalUrl(unwrapDestination(dest)) ? m : text
    ),
  (t, ctx, u) => t.replace(RAW_IMG, (tag) => ctx.defer(() => rewriteRawImage(u(tag), ctx))),
  (t) => t.replace(HIGHLIGHT, "<mark>$1</mark>"),
  (t, ctx) =>
    t.replace(INLINE_FOOTNOTE, (_m, note: string) => {
      ctx.footnotes.push(note);
      return `[^pfpdf-${ctx.footnotes.length}]`;
    }),
  (t) => t.replace(BLOCK_ID, ""),
];

export function transformInline(line: string, ctx: BodyContext, comments: CommentState): string {
  const { text, slots } = protect(line);
  const u = (s: string): string => restore(s, slots);
  const converted = STEPS.reduce((acc, step) => step(acc, ctx, u), stripComments(text, comments));
  return restore(converted, slots);
}
