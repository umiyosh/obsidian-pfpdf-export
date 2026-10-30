export interface WikiTarget {
  linkpath: string;
  /** Heading or block reference without the leading "#", empty when absent. */
  subpath: string;
  params: string[];
}

// Inside tables the pipe is written as "\|", so both forms separate parameters.
export function parseWikiInner(inner: string): WikiTarget {
  const [target = "", ...params] = inner.split(/\\?\|/);
  const hash = target.indexOf("#");
  return {
    linkpath: (hash < 0 ? target : target.slice(0, hash)).trim(),
    subpath: hash < 0 ? "" : target.slice(hash + 1).trim(),
    params: params.map((p) => p.trim()),
  };
}

export interface ImageSpec {
  alt: string;
  width?: string;
  height?: string;
}

/** Obsidian puts an optional "WIDTH" or "WIDTHxHEIGHT" after the last pipe. */
export function splitSize(params: string[]): ImageSpec {
  const last = params[params.length - 1];
  const m = last?.match(/^(\d+)(?:x(\d+))?$/);
  if (!m) return { alt: params.join("|") };
  return { alt: params.slice(0, -1).join("|"), width: m[1], height: m[2] };
}

export function wikiDisplayText(t: WikiTarget): string {
  if (t.params.length > 0 && t.params.join("|") !== "") return t.params.join("|");
  const sub = t.subpath.replace(/^\^/, "");
  if (!t.linkpath) return sub;
  return sub ? `${t.linkpath} > ${sub}` : t.linkpath;
}

export function isExternalUrl(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

export function isRemoteUrl(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

export function unwrapDestination(dest: string): string {
  const raw = dest.startsWith("<") && dest.endsWith(">") ? dest.slice(1, -1) : dest;
  try {
    return decodeURI(raw);
  } catch {
    return raw;
  }
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function imageMarkup(src: string, spec: ImageSpec): string {
  if (!spec.width) {
    const alt = spec.alt.replace(/([\\\]])/g, "\\$1");
    const dest = /[\s()<>]/.test(src) ? `<${src}>` : src;
    return `![${alt}](${dest})`;
  }
  const height = spec.height ? ` height="${spec.height}"` : "";
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(spec.alt)}" width="${spec.width}"${height}>`;
}

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "bmp",
  "ico",
  "apng",
]);
// Obsidian displays these, but Chromium (and therefore pfpdf) cannot decode them.
const UNRENDERABLE_IMAGE_EXTENSIONS = new Set(["heic", "heif", "tif", "tiff"]);

export function isImageExtension(ext: string): boolean {
  return IMAGE_EXTENSIONS.has(ext);
}

export function isUnrenderableImageExtension(ext: string): boolean {
  return UNRENDERABLE_IMAGE_EXTENSIONS.has(ext);
}
