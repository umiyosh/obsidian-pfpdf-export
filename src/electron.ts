// Obsidian desktop exposes Electron's remote module; typing only what this plugin uses avoids
// depending on the electron package.
interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

interface ElectronRemote {
  dialog: {
    showSaveDialog(options: {
      title: string;
      defaultPath: string;
      filters: Array<{ name: string; extensions: string[] }>;
    }): Promise<SaveDialogResult>;
  };
  shell: { openPath(path: string): Promise<string> };
}

declare global {
  interface Window {
    require?: (id: string) => unknown;
  }
}

function isObject(value: unknown): value is object {
  return typeof value === "object" && value !== null;
}

function isRemote(value: unknown): value is ElectronRemote {
  if (typeof value !== "object" || value === null) return false;
  if (!("dialog" in value) || !("shell" in value)) return false;
  return isObject(value.dialog) && isObject(value.shell);
}

export function electronRemote(): ElectronRemote | null {
  try {
    const electron = window.require?.("electron");
    if (typeof electron !== "object" || electron === null || !("remote" in electron)) return null;
    return isRemote(electron.remote) ? electron.remote : null;
  } catch {
    // Not running inside the Electron renderer (e.g. a mobile build): no dialog or shell.
    return null;
  }
}
