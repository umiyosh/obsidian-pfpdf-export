import { Notice, PluginSettingTab, type App, type SettingDefinitionItem } from "obsidian";
import { TEMPLATES } from "./convert/frontmatter";
import { INSTALL_COMMAND } from "./export/readiness";
import type PfpdfExportPlugin from "./main";
import { DEFAULT_SETTINGS, parseSettings, type OutputLocation } from "./settings-data";

const LOCATION_LABELS: Record<OutputLocation, string> = {
  ask: "Ask every time",
  "note-folder": "Same folder as the note",
  folder: "Fixed folder in the vault",
};

export class PfpdfSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: PfpdfExportPlugin
  ) {
    super(app, plugin);
  }

  override getControlValue(key: string): unknown {
    return Object.entries(this.plugin.settings).find(([k]) => k === key)?.[1];
  }

  /** Every change goes through parseSettings, the same validation as data loaded from disk. */
  override async setControlValue(key: string, value: unknown): Promise<void> {
    this.plugin.settings = parseSettings({ ...this.plugin.settings, [key]: value });
    await this.plugin.saveSettings();
    if (key === "outputLocation") this.update();
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    return [...this.documentDefinitions(), this.outputGroup(), this.advancedGroup()];
  }

  private documentDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Default template",
        desc: "Used when the note's front matter has no template.",
        control: {
          type: "dropdown",
          key: "template",
          options: Object.fromEntries(TEMPLATES.map((t) => [t, t])),
          defaultValue: DEFAULT_SETTINGS.template,
        },
      },
      {
        name: "Table of contents",
        desc: "Used when the note's front matter has no toc value.",
        control: { type: "toggle", key: "toc", defaultValue: DEFAULT_SETTINGS.toc },
      },
    ];
  }

  private outputGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "Output",
      items: [
        {
          name: "Save location",
          control: { type: "dropdown", key: "outputLocation", options: LOCATION_LABELS },
        },
        {
          name: "Output folder",
          desc: "Vault folder for PDFs. It is created if it does not exist.",
          visible: () => this.plugin.settings.outputLocation === "folder",
          control: { type: "folder", key: "outputFolder", includeRoot: true },
        },
        {
          name: "Open after export",
          control: { type: "toggle", key: "openAfterExport" },
        },
      ],
    };
  }

  private advancedGroup(): SettingDefinitionItem {
    return {
      type: "group",
      heading: "Advanced",
      items: [
        {
          name: "Pfpdf command",
          desc: `Command that runs pfpdf. Install pfpdf with "${INSTALL_COMMAND}" (Node.js 22.12 or later).`,
          control: {
            type: "text",
            key: "command",
            placeholder: DEFAULT_SETTINGS.command,
            validate: (v) => (v.trim() === "" ? "Enter the command that runs pfpdf." : undefined),
          },
        },
        {
          name: "Check pfpdf",
          desc: "Runs the command above with --version and --doctor to see whether exports can run.",
          action: () => void this.check(),
        },
        {
          name: "Extra arguments",
          desc: "Appended to every pfpdf run, for example --host-fonts.",
          control: { type: "text", key: "extraArgs" },
        },
        {
          name: "Additional search path",
          desc: "Folders to search for Node.js and pfpdf, in PATH syntax, if they are not found.",
          control: { type: "text", key: "extraPath" },
        },
        {
          name: "Timeout in seconds",
          desc: "Time limit for one export.",
          control: { type: "number", key: "timeoutSeconds", min: 10, max: 3600, step: 1 },
        },
        {
          name: "Keep work directory",
          desc: "Keeps the generated Markdown and copied images for troubleshooting.",
          control: { type: "toggle", key: "keepWorkDir" },
        },
      ],
    };
  }

  private async check(): Promise<void> {
    const notice = new Notice("Checking pfpdf…", 0);
    const message = await this.plugin.checkPfpdf();
    notice.hide();
    new Notice(message, 10_000);
  }
}
