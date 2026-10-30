export const TEMPLATES = [
  "academic",
  "book",
  "compact",
  "default",
  "notebook",
  "pfn",
  "technical",
] as const;
export type Template = (typeof TEMPLATES)[number];

export interface DocumentDefaults {
  template: Template;
  toc: boolean;
}

export type FrontMatter = Readonly<Record<string, unknown>>;

interface FrontMatterEnv {
  warn(message: string): void;
  /** Copies a file referenced from the front matter and returns its path for the generated Markdown. */
  copyAsset(path: string): Promise<string | null>;
}

const DIRECTIONS = ["ltr", "rtl", "auto"];
// Plain text keys pfpdf accepts as-is; `toc`, `template` and file keys need dedicated handling.
const TEXT_KEYS = ["date", "page_size", "lang"] as const;

function text(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value;
  if (typeof value === "number") return String(value);
  return undefined;
}

function authorText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const names = value.map(text).filter((v): v is string => v !== undefined);
    return names.length > 0 ? names.join(", ") : undefined;
  }
  return text(value);
}

function isTemplate(value: unknown): value is Template {
  return typeof value === "string" && (TEMPLATES as readonly string[]).includes(value);
}

function boolean(key: string, value: unknown, env: FrontMatterEnv): boolean | undefined {
  if (value === undefined || typeof value === "boolean") return value;
  env.warn(`Ignored front matter "${key}": expected true or false`);
  return undefined;
}

function template(value: unknown, defaults: DocumentDefaults, env: FrontMatterEnv): Template {
  if (value === undefined || isTemplate(value)) return value ?? defaults.template;
  env.warn(
    `Unknown template ${JSON.stringify(value)} in front matter; using "${defaults.template}"`
  );
  return defaults.template;
}

function direction(value: unknown, env: FrontMatterEnv): string | undefined {
  if (value === undefined || (typeof value === "string" && DIRECTIONS.includes(value))) {
    return value;
  }
  env.warn(`Ignored front matter "dir": expected ltr, rtl or auto`);
  return undefined;
}

async function copyFiles(paths: string[], label: string, env: FrontMatterEnv): Promise<string[]> {
  const copied: string[] = [];
  for (const path of paths) {
    const local = await env.copyAsset(path);
    if (local) copied.push(local);
    else env.warn(`${label} not found: ${path}`);
  }
  return copied;
}

async function logo(value: unknown, env: FrontMatterEnv): Promise<string | false | undefined> {
  if (value === false) return false;
  const path = text(value);
  if (!path) return undefined;
  const [copied] = await copyFiles([path], "Logo", env);
  return copied;
}

async function bibliography(value: unknown, env: FrontMatterEnv): Promise<string[] | undefined> {
  const paths = (Array.isArray(value) ? value : [value]).map(text).filter((v) => v !== undefined);
  if (paths.length === 0) return undefined;
  const copied = await copyFiles(paths, "Bibliography", env);
  return copied.length > 0 ? copied : undefined;
}

/**
 * Builds the YAML lines pfpdf reads. Only keys pfpdf understands are passed, after type checks,
 * because pfpdf fails the whole build on a known key with the wrong type. Values are written as
 * JSON, which is valid YAML and needs no escaping rules of its own.
 */
export async function buildFrontMatter(
  fm: FrontMatter,
  fallbackTitle: string,
  defaults: DocumentDefaults,
  env: FrontMatterEnv
): Promise<string[]> {
  const entries: Array<[string, unknown]> = [
    ["title", text(fm.title) ?? fallbackTitle],
    ["author", authorText(fm.author)],
    ["series", text(fm.series)],
    ["template", template(fm.template, defaults, env)],
    ["toc", boolean("toc", fm.toc, env) ?? defaults.toc],
    ...TEXT_KEYS.map((key): [string, unknown] => [key, text(fm[key])]),
    ["dir", direction(fm.dir, env)],
    ["confidential", boolean("confidential", fm.confidential, env)],
    ["logo", await logo(fm.logo, env)],
    ["bibliography", await bibliography(fm.bibliography, env)],
  ];
  return entries
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
}
