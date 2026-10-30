import { Notice, Plugin, TFile } from "obsidian";
import { homedir } from "node:os";
import { buildSearchPath, loginShellPath, runCommand, splitCommand } from "./export/command";
import { checkReadiness, notFoundMessage, type Readiness } from "./export/readiness";
import { runExport } from "./export-action";
import { PfpdfSettingTab } from "./settings";
import { DEFAULT_SETTINGS, parseSettings, type PfpdfSettings } from "./settings-data";

export default class PfpdfExportPlugin extends Plugin {
  override settings: PfpdfSettings = { ...DEFAULT_SETTINGS };
  private loginPath: Promise<string | null> | null = null;
  private running = false;
  private readyKey: string | null = null;

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

  /** Runs `pfpdf --version` and `--doctor` so the settings tab can show whether exports work. */
  async checkPfpdf(): Promise<string> {
    const searchPath = await this.searchPath();
    const { command } = this.settings;
    const result = await runCommand([...splitCommand(command), "--version"], {
      env: { ...process.env, PATH: searchPath },
      timeoutMs: this.settings.timeoutSeconds * 1000,
    });
    if (result.startError && /ENOENT/.test(result.startError)) return notFoundMessage(command);
    if (result.exitCode !== 0) {
      return `pfpdf could not run: ${result.startError ?? result.output.trim().slice(-300)}`;
    }
    const readiness = await this.readiness(searchPath);
    const version = result.output.trim().split("\n").pop() ?? "";
    return readiness.ok ? `pfpdf ${version} is ready.` : readiness.message;
  }

  /** Remembers a passing check per command and PATH, since --doctor takes seconds. */
  private async readiness(searchPath: string): Promise<Readiness> {
    const { command, extraArgs } = this.settings;
    const key = JSON.stringify([command, extraArgs, searchPath]);
    if (this.readyKey === key) return { ok: true };
    const readiness = await checkReadiness({ command, extraArgs, searchPath });
    this.readyKey = readiness.ok ? key : null;
    return readiness;
  }

  async exportFile(file: TFile): Promise<void> {
    if (this.running) {
      new Notice("A PDF export is already running.");
      return;
    }
    this.running = true;
    try {
      const searchPath = await this.searchPath();
      const checking = new Notice("Checking pfpdf…", 0);
      const readiness = await this.readiness(searchPath);
      checking.hide();
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
