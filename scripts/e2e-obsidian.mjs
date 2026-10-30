#!/usr/bin/env node
// Real-app E2E: exports the fixture note from an isolated Obsidian instance (separate user data
// directory, so a running Obsidian is not touched) and checks the images in the resulting PDF.
// macOS only. Requires a built main.js and poppler (pdfimages, pdftotext). Run: make e2e-obsidian

import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const repo = resolve(import.meta.dirname, "..");
const obsidianBin =
  process.env.OBSIDIAN_BIN ?? "/Applications/Obsidian.app/Contents/MacOS/Obsidian";
const port = Number(process.env.OBSIDIAN_DEBUG_PORT ?? 9333);
const outDir = join(repo, "tests/.output/obsidian");
const REMOTE_SVG =
  "https://raw.githubusercontent.com/pfnet-research/pfpdf/main/docs/tutorial.en/assets/example.svg";
const REMOTE_WEBP =
  "https://raw.githubusercontent.com/pfnet-research/pfpdf/main/docs/readme/notebook-code.en.webp";

function prepare() {
  const root = mkdtempSync(join(tmpdir(), "pfpdf-obsidian-e2e-"));
  const vault = join(root, "vault");
  const userData = join(root, "user-data");
  cpSync(join(repo, "tests/fixtures/vault"), vault, { recursive: true });
  const notePath = join(vault, "notes/report.md");
  const note = readFileSync(notePath, "utf8")
    .replace("{{REMOTE}}/remote.png", REMOTE_SVG)
    .concat(`\n![webp](${REMOTE_WEBP})\n`);
  writeFileSync(notePath, note);

  const pluginDir = join(vault, ".obsidian/plugins/pfpdf-export");
  mkdirSync(pluginDir, { recursive: true });
  cpSync(join(repo, "main.js"), join(pluginDir, "main.js"));
  cpSync(join(repo, "manifest.json"), join(pluginDir, "manifest.json"));
  const settings = { outputLocation: "note-folder", openAfterExport: false };
  writeFileSync(join(pluginDir, "data.json"), JSON.stringify(settings));
  writeFileSync(join(vault, ".obsidian/community-plugins.json"), '["pfpdf-export"]');

  // Obsidian loads the newest app bundle from the user data directory, so copy the installed one.
  mkdirSync(userData);
  const appSupport = join(homedir(), "Library/Application Support/obsidian");
  const asar = existsSync(appSupport)
    ? readdirSync(appSupport)
        .filter((n) => /^obsidian-[\d.]+\.asar$/.test(n))
        .sort()
        .pop()
    : undefined;
  if (asar) cpSync(join(appSupport, asar), join(userData, asar));
  const vaults = { pfpdfe2e00000001: { path: vault, ts: Date.now(), open: true } };
  writeFileSync(join(userData, "obsidian.json"), JSON.stringify({ vaults }));
  return { root, vault, userData };
}

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = pages.find((p) => p.type === "page" && p.url.includes("index.html"));
      if (page) return cdpClient(page.webSocketDebuggerUrl);
    } catch {
      // Not listening yet.
    }
    await sleep(1000);
  }
  throw new Error("Obsidian did not open the vault window");
}

async function cdpClient(url) {
  const ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.consoleAPICalled") {
      events.push(
        `console.${message.params.type}: ${message.params.args.map((a) => a.value ?? a.description).join(" ")}`
      );
    } else if (message.method === "Runtime.exceptionThrown") {
      events.push(`exception: ${message.params.exceptionDetails.exception?.description}`);
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  };
  const send = (method, params = {}) =>
    new Promise((res) => {
      id += 1;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) => {
    const { result, error } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (error) throw new Error(`${error.message}: ${expression}`);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? expression);
    }
    return result.result.value;
  };
  const screenshot = async (file) => {
    const { result } = await send("Page.captureScreenshot", { format: "png" });
    writeFileSync(file, Buffer.from(result.data, "base64"));
  };
  await send("Runtime.enable");
  return { evaluate, screenshot, events, close: () => ws.close() };
}

async function waitFor(check, timeoutMs, label) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await sleep(1000);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function tool(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr}`);
  return result.stdout;
}

async function exportInObsidian(page, vault) {
  await waitFor(() => page.evaluate("!!window.app?.workspace?.layoutReady"), 60_000, "layout");
  // The path a user takes: answer "trust author and enable plugins", then Obsidian loads them.
  await waitFor(
    () => page.evaluate("!!document.querySelector('.modal-container')"),
    30_000,
    "trust dialog"
  );
  await closeDialogs(page);
  await waitFor(
    () => page.evaluate('!!app.plugins.plugins["pfpdf-export"]'),
    30_000,
    "plugin load"
  );
  await page.evaluate(
    'app.workspace.getLeaf().openFile(app.vault.getAbstractFileByPath("notes/report.md")).then(() => true)'
  );
  const ran = await page.evaluate(
    'app.commands.executeCommandById("pfpdf-export:export-current-note")'
  );
  if (!ran) throw new Error("The export command is not available");
  const pdf = join(vault, "notes/report.pdf");
  // Obsidian renders notices into activeDocument. After the trust dialog is answered by a script
  // (no real focus events), that is an off-screen about:blank document rather than `document`,
  // for Obsidian's own notices too; reading it there keeps the check independent of focus.
  const notices = [];
  const done = async () => {
    const visible = await page.evaluate(
      '[...activeDocument.querySelectorAll(".notice")].map((n) => n.textContent)'
    );
    for (const text of visible) if (!notices.includes(text)) notices.push(text);
    const failed = notices.find((t) => t.startsWith("PDF export failed"));
    if (failed) return failed;
    const running = await page.evaluate('app.plugins.plugins["pfpdf-export"]?.running');
    if (notices.some((t) => t.startsWith("Exported")) || (existsSync(pdf) && !running)) {
      return "Exported";
    }
    return null;
  };
  const timeoutMs = Number(process.env.E2E_EXPORT_TIMEOUT_MS ?? 600_000);
  const notice = await waitFor(done, timeoutMs, "the export to finish").catch(async (error) => {
    await page.screenshot(join(outDir, "timeout.png"));
    const recent = page.events.slice(-30).join("\n");
    throw new Error(`${error.message}\nnotices: ${JSON.stringify(notices)}\nconsole:\n${recent}`);
  });
  await closeDialogs(page);
  await page.screenshot(join(outDir, "after-export.png"));
  if (!notice.startsWith("Exported")) throw new Error(notice);
  return { pdf, notices };
}

function checkPdf(pdf) {
  const images = tool("pdfimages", ["-list", pdf])
    .split("\n")
    .slice(2)
    .map((l) => l.trim().split(/\s+/))
    .filter((c) => c[2] === "image")
    .map((c) => `${c[3]}x${c[4]}`);
  const text = tool("pdftotext", [pdf, "-"]);
  const failures = [];
  for (const size of ["240x160", "400x100", "200x140"]) {
    if (!images.includes(size)) failures.push(`missing raster image ${size}`);
  }
  if (!images.some((s) => !["240x160", "400x100", "200x140"].includes(s))) {
    failures.push("missing the remote WebP image");
  }
  if ((text.match(/SVG diagram/g) ?? []).length !== 2) failures.push("missing a local SVG");
  if (!/sample local asset/i.test(text)) failures.push("missing the remote SVG");
  tool("pdftoppm", ["-r", "50", "-png", pdf, join(outDir, "page")]);
  return { images, failures };
}

// A vault with plugins asks whether to trust its author. Pressing the last button ("Trust
// author and enable plugins") is what a user does; matching by position avoids locale text.
async function closeDialogs(page) {
  for (let i = 0; i < 5; i++) {
    const clicked = await page.evaluate(`(() => {
      const buttons = document.querySelectorAll(".modal-container .modal-button-container button");
      buttons[buttons.length - 1]?.click();
      return buttons.length > 0;
    })()`);
    if (!clicked) return;
    await sleep(500);
  }
}

// Like notices, the settings modal goes to activeDocument, so its rendered rows are read there.
async function renderedSettings(page) {
  await closeDialogs(page);
  await page.evaluate('void (app.setting.open(), app.setting.openTabById("pfpdf-export"))');
  await sleep(1500);
  return page.evaluate(
    `[...activeDocument.querySelectorAll(".vertical-tab-content .setting-item-name")]
      .filter((n) => n.closest(".setting-item")?.style.display !== "none")
      .map((n) => n.textContent)`
  );
}

mkdirSync(outDir, { recursive: true });
const { vault, userData } = prepare();
// A Dock launch gives apps only the system PATH; the plugin must find Node.js on its own.
const env = { ...process.env, PATH: "/usr/bin:/bin:/usr/sbin:/sbin" };
const obsidian = spawn(
  obsidianBin,
  [`--user-data-dir=${userData}`, `--remote-debugging-port=${port}`],
  { env, stdio: "ignore" }
);
let exitCode = 1;
try {
  const page = await connect();
  const { pdf, notices } = await exportInObsidian(page, vault);
  const { images, failures } = checkPdf(pdf);
  const settings = await renderedSettings(page);
  const expected = ["Default template", "Save location", "Pfpdf command", "Timeout in seconds"];
  for (const name of expected) {
    if (!settings.includes(name)) failures.push(`setting not rendered: ${name}`);
  }
  if (settings.includes("Output folder")) failures.push("Output folder shown for note-folder");
  page.close();
  if (!notices.some((t) => t.startsWith("Exported"))) failures.push("no Exported notice was shown");
  process.stdout.write(
    `${JSON.stringify({ pdf, notices, images, settings, failures }, null, 2)}\n`
  );
  exitCode = failures.length === 0 ? 0 : 1;
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
} finally {
  const exited = new Promise((res) => obsidian.once("exit", () => res(true)));
  obsidian.kill("SIGTERM");
  // Wait so no helper process outlives the run; force it if Obsidian ignores SIGTERM.
  if (!(await Promise.race([exited, sleep(10_000).then(() => false)]))) obsidian.kill("SIGKILL");
}
process.exit(exitCode);
