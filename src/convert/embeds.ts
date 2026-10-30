import { extractSubpath } from "./blocks";
import { placeholder, type BodyContext } from "./context";
import {
  escapeAttr,
  imageMarkup,
  isImageExtension,
  isRemoteUrl,
  isUnrenderableImageExtension,
  parseWikiInner,
  splitSize,
  unwrapDestination,
  type ImageSpec,
} from "./links";
import type { LinkedFile } from "./types";

// Deep enough for real notes, shallow enough to stop runaway transclusion chains.
const MAX_EMBED_DEPTH = 8;
const SRC_ATTR = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)')/i;

interface EmbedRequest {
  subpath: string;
  spec: ImageSpec;
  /** Link text as written, used in placeholders and warnings. */
  label: string;
}

function fileName(file: LinkedFile): string {
  return file.extension ? `${file.basename}.${file.extension}` : file.basename;
}

function where(ctx: BodyContext): string {
  return `(in ${ctx.sourcePath})`;
}

function isExcalidraw(file: LinkedFile, content: string): boolean {
  return file.basename.endsWith(".excalidraw") || /^excalidraw-plugin:/m.test(content);
}

async function remoteImage(url: string, spec: ImageSpec, ctx: BodyContext): Promise<string> {
  const local = await ctx.host.addRemoteAsset(url);
  if (!local) {
    ctx.host.warn(`Could not download image: ${url}; pfpdf will try to load it directly`);
  }
  return imageMarkup(local ?? url, spec);
}

/** The Excalidraw plugin can auto-export drawings as SVG/PNG next to the drawing note. */
async function embedExcalidraw(file: LinkedFile, req: EmbedRequest, ctx: BodyContext) {
  const stem = file.basename.replace(/\.excalidraw$/, "");
  const names = [file.basename, stem].flatMap((n) => [`${n}.svg`, `${n}.png`]);
  for (const name of names) {
    const image = ctx.host.resolve(name, file.path);
    if (image && isImageExtension(image.extension)) {
      return imageMarkup(await ctx.host.addLocalAsset(image), req.spec);
    }
  }
  ctx.host.warn(
    `${file.basename}: Enable SVG or PNG auto-export in the Excalidraw plugin to include this drawing`
  );
  return placeholder("Excalidraw drawing", file.basename);
}

async function embedNote(file: LinkedFile, req: EmbedRequest, ctx: BodyContext) {
  const key = `${file.path}#${req.subpath}`;
  if (ctx.chain.includes(key) || ctx.chain.length > MAX_EMBED_DEPTH) {
    ctx.host.warn(`Circular embed skipped: ${req.label} ${where(ctx)}`);
    return placeholder("Circular embed", req.label);
  }
  const content = (await ctx.host.readNote(file)).replace(/\r\n?/g, "\n");
  if (isExcalidraw(file, content)) return embedExcalidraw(file, req, ctx);
  const part = extractSubpath(content, req.subpath);
  if (part === null) {
    ctx.host.warn(`Section not found: ${req.label} ${where(ctx)}`);
    return placeholder("Missing section", req.label);
  }
  const body = await ctx.renderNested(part, file.path, key);
  return `\n\n${body.trim()}\n\n`;
}

async function embedFile(file: LinkedFile, req: EmbedRequest, ctx: BodyContext): Promise<string> {
  if (isImageExtension(file.extension)) {
    return imageMarkup(await ctx.host.addLocalAsset(file), req.spec);
  }
  if (isUnrenderableImageExtension(file.extension)) {
    ctx.host.warn(
      `${fileName(file)}: Chromium cannot render ${file.extension.toUpperCase()} images; convert it to PNG or JPEG`
    );
    return placeholder("Unsupported image", fileName(file));
  }
  if (file.extension === "md") return embedNote(file, req, ctx);
  return placeholder("Attachment", fileName(file));
}

export function embedWiki(inner: string, ctx: BodyContext): Promise<string> {
  const target = parseWikiInner(inner);
  const label = (inner.split(/\\?\|/)[0] ?? "").trim();
  const file = ctx.host.resolve(target.linkpath || ctx.sourcePath, ctx.sourcePath);
  if (!file) {
    ctx.host.warn(`Embedded file not found: ${label} ${where(ctx)}`);
    return Promise.resolve(placeholder("Missing", label));
  }
  return embedFile(file, { subpath: target.subpath, spec: splitSize(target.params), label }, ctx);
}

export function embedMarkdownImage(alt: string, dest: string, ctx: BodyContext): Promise<string> {
  const href = unwrapDestination(dest);
  if (/^(?:data|file):/i.test(href)) return Promise.resolve(`![${alt}](${dest})`);
  const spec = splitSize(alt.split("|"));
  if (isRemoteUrl(href)) return remoteImage(href, spec, ctx);
  const hash = href.indexOf("#");
  const path = (hash < 0 ? href : href.slice(0, hash)).split("?")[0] ?? "";
  const file = ctx.host.resolve(path, ctx.sourcePath);
  if (!file) {
    ctx.host.warn(`Image not found: ${href} ${where(ctx)}`);
    return Promise.resolve(placeholder("Missing", href));
  }
  const subpath = hash < 0 ? "" : href.slice(hash + 1);
  return embedFile(file, { subpath, spec, label: href }, ctx);
}

async function resolveImageSource(src: string, ctx: BodyContext): Promise<string | null> {
  const href = unwrapDestination(src);
  if (/^(?:data|file):/i.test(href)) return null;
  if (isRemoteUrl(href)) {
    const local = await ctx.host.addRemoteAsset(href);
    if (!local)
      ctx.host.warn(`Could not download image: ${href}; pfpdf will try to load it directly`);
    return local;
  }
  const file = ctx.host.resolve(href.split(/[?#]/)[0] ?? "", ctx.sourcePath);
  if (!file || !isImageExtension(file.extension)) {
    ctx.host.warn(`Image not found: ${href} ${where(ctx)}`);
    return null;
  }
  return ctx.host.addLocalAsset(file);
}

/** Raw <img> tags would otherwise point at paths that do not exist in the work directory. */
export async function rewriteRawImage(tag: string, ctx: BodyContext): Promise<string> {
  const m = tag.match(SRC_ATTR);
  if (!m) return tag;
  const resolved = await resolveImageSource(m[1] ?? m[2] ?? "", ctx);
  return resolved ? tag.replace(m[0], `src="${escapeAttr(resolved)}"`) : tag;
}
