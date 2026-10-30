import { join } from "node:path";
import type { OutputLocation } from "./settings-data";

interface OutputTarget {
  location: OutputLocation;
  vaultBase: string;
  /** Vault-relative folder of the note; "" or "/" for the vault root. */
  noteFolder: string;
  outputFolder: string;
  basename: string;
}

/** Characters that are invalid in file names on Windows or macOS. */
export function safeFileName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, "_").trim();
  return cleaned === "" ? "note" : cleaned;
}

/** Where the PDF goes without asking; also the starting point of the save dialog. */
export function defaultOutputPath(target: OutputTarget): string {
  const custom = target.location === "folder" ? target.outputFolder.trim() : "";
  const folder = (custom || target.noteFolder).replace(/^\/+|\/+$/g, "");
  return join(target.vaultBase, folder, `${safeFileName(target.basename)}.pdf`);
}

export function ensurePdfExtension(path: string): string {
  return /\.pdf$/i.test(path) ? path : `${path}.pdf`;
}
