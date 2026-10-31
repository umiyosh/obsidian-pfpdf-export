import { Notice, Plugin, TFile } from "obsidian";
import { homedir } from "node:os";
import { buildSearchPath, loginShellPath } from "./export/command";
import { checkReadiness, type Readiness } from "./export/readiness";
import { runExport } from "./export-action";
import { PfpdfSettingTab } from "./settings";
import { DEFAULT_SETTINGS, parseSettings, type PfpdfSettings } from "./settings-data";

export default class PfpdfExportPlugin extends Plugin {
  override settings: PfpdfSettings = { ...DEFAULT_SETTINGS };
  private loginPath: Promise<string | null> | null = null;
  private running = false;

  override async onload(): Promise<void> {
    this.settings = parseSettings(await this.loadData());

    this.addCommand({
      id: "export-current-note",
      name: "Export current note to PDF",
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.exportFile(file);
        return true;
      },
    });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== "md") return;
        menu.addItem((item) =>
          item
            .setTitle("Export to PDF with pfpdf")
            .setIcon("file-output")
            .setSection("action")
            .onClick(() => void this.exportFile(file))
        );
      })
    );

    this.addSettingTab(new PfpdfSettingTab(this.app, this));
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** PATH for pfpdf; the login shell is asked once per session because it is slow. */
  async searchPath(): Promise<string> {
    const shell = process.env.SHELL;
    if (process.platform !== "win32" && shell) {
      this.loginPath ??= loginShellPath(shell);
    }
    return buildSearchPath({
      extra: this.settings.extraPath,
      loginShell: (await this.loginPath) ?? null,
      current: process.env.PATH,
      home: homedir(),
      platform: process.platform,
    });
  }

  /** Lets the settings tab show whether the pfpdf command starts. */
  async checkPfpdf(): Promise<string> {
    const readiness = await this.readiness(await this.searchPath());
    return readiness.ok ? `pfpdf ${readiness.version} is ready.` : readiness.message;
  }

  private readiness(searchPath: string): Promise<Readiness> {
    const { command, timeoutSeconds } = this.settings;
    return checkReadiness({ command, searchPath, timeoutMs: timeoutSeconds * 1000 });
  }

  async exportFile(file: TFile): Promise<void> {
    if (this.running) {
      new Notice("A PDF export is already running.");
      return;
    }
    this.running = true;
    try {
      const searchPath = await this.searchPath();
      const readiness = await this.readiness(searchPath);
      if (!readiness.ok) {
        new Notice(readiness.message, 0);
        return;
      }
      await runExport(this.app, file, this.settings, searchPath);
    } finally {
      this.running = false;
    }
  }
}
