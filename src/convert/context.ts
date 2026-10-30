import type { ConvertHost } from "./types";

export interface BodyContext {
  host: ConvertHost;
  /** Vault path of the note whose text is being converted; links resolve relative to it. */
  sourcePath: string;
  /** Embeds currently being expanded, used to stop circular embeds. */
  chain: readonly string[];
  /** Definitions of converted inline footnotes, shared by the whole document. */
  footnotes: string[];
  /** Schedules async work and returns a placeholder that is replaced by its result. */
  defer(job: () => Promise<string>): string;
  renderNested(text: string, sourcePath: string, chainKey: string): Promise<string>;
}

export function placeholder(kind: string, name: string): string {
  return `*\\[${kind}: ${name.replace(/[\\*_[\]`]/g, "\\$&")}\\]*`;
}
