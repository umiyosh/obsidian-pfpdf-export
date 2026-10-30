import { Notice, Plugin, TFile } from "obsidian";
import { homedir } from "node:os";
import { buildSearchPath, loginShellPath, runCommand, splitCommand } from "./export/command";
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

  /** Runs `pfpdf --version` so the settings tab can show whether the command works. */
  async checkPfpdf(): Promise<string> {
    const result = await runCommand([...splitCommand(this.settings.command), "--version"], {
      env: { ...process.env, PATH: await this.searchPath() },
      timeoutMs: this.settings.timeoutSeconds * 1000,
    });
    if (result.exitCode === 0) return `pfpdf ${result.output.trim().split("\n").pop() ?? ""}`;
    return `pfpdf could not run: ${result.startError ?? result.output.trim().slice(-300)}`;
  }

  async exportFile(file: TFile): Promise<void> {
    if (this.running) {
      new Notice("A PDF export is already running.");
      return;
    }
    this.running = true;
    try {
      await runExport(this.app, file, this.settings, await this.searchPath());
    } finally {
      this.running = false;
    }
  }
}
