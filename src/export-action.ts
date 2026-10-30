import { FileSystemAdapter, Notice, type App, type TFile } from "obsidian";
import { electronRemote } from "./electron";
import { ObsidianVaultIO } from "./export/obsidian-io";
import { ExportError, exportNote, type ExportOptions } from "./export/pipeline";
import { defaultOutputPath, ensurePdfExtension } from "./output-path";
import type { PfpdfSettings } from "./settings-data";

// Notices that carry warnings or errors stay long enough to be read.
const LONG_NOTICE_MS = 15_000;
const MAX_LISTED_WARNINGS = 5;

function vaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter;
  return adapter instanceof FileSystemAdapter ? adapter.getBasePath() : null;
}

async function chooseOutputPath(
  app: App,
  file: TFile,
  settings: PfpdfSettings
): Promise<string | null> {
  const vaultBase = vaultBasePath(app);
  if (!vaultBase) return null;
  const suggested = defaultOutputPath({
    location: settings.outputLocation,
    vaultBase,
    noteFolder: file.parent?.path ?? "",
    outputFolder: settings.outputFolder,
    basename: file.basename,
  });
  const remote = electronRemote();
  if (settings.outputLocation !== "ask" || !remote) return suggested;
  const result = await remote.dialog.showSaveDialog({
    title: "Export to PDF",
    defaultPath: suggested,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  return result.canceled || !result.filePath ? null : ensurePdfExtension(result.filePath);
}

function warningText(warnings: readonly string[]): string {
  if (warnings.length === 0) return "";
  const listed = warnings.slice(0, MAX_LISTED_WARNINGS).map((w) => `• ${w}`);
  const more = warnings.length - listed.length;
  return `\n${listed.join("\n")}${more > 0 ? `\n…and ${more} more` : ""}`;
}

async function openPdf(path: string): Promise<void> {
  const error = await electronRemote()?.shell.openPath(path);
  if (error) new Notice(`Could not open the PDF: ${error}`);
}

/** Runs one export with progress and result notices; resolves even when the export fails. */
export async function runExport(
  app: App,
  file: TFile,
  settings: PfpdfSettings,
  searchPath: string
): Promise<void> {
  const outputPath = await chooseOutputPath(app, file, settings);
  if (!outputPath) return;
  const options: ExportOptions = {
    command: settings.command,
    extraArgs: settings.extraArgs,
    defaults: { template: settings.template, toc: settings.toc },
    searchPath,
    keepWorkDir: settings.keepWorkDir,
    timeoutMs: settings.timeoutSeconds * 1000,
  };
  const progress = new Notice(`Exporting ${file.basename} to PDF…`, 0);
  try {
    const note = {
      path: file.path,
      content: await app.vault.cachedRead(file),
      title: file.basename,
      frontmatter: app.metadataCache.getFileCache(file)?.frontmatter,
    };
    const result = await exportNote(new ObsidianVaultIO(app), note, outputPath, options);
    progress.hide();
    const kept = result.workDir ? `\nWork directory kept at ${result.workDir}` : "";
    const message = `Exported ${outputPath}${warningText(result.warnings)}${kept}`;
    new Notice(message, result.warnings.length > 0 || kept ? LONG_NOTICE_MS : undefined);
    if (settings.openAfterExport) await openPdf(outputPath);
  } catch (error: unknown) {
    progress.hide();
    const detail = error instanceof Error ? error.message : String(error);
    const warnings = error instanceof ExportError ? warningText(error.warnings) : "";
    new Notice(`PDF export failed: ${detail}${warnings}`, LONG_NOTICE_MS);
    console.error("pfpdf export failed", error);
  }
}
