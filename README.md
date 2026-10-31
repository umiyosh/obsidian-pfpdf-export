# pfpdf Export

[日本語](README.ja.md)

Export Obsidian notes to print-quality PDFs with a cover page and table of contents, typeset by [pfpdf](https://github.com/pfnet-research/pfpdf). Images embedded in the note, including sized images, HTML `<img>` tags and remote images, are included in the PDF.

The plugin works on desktop only (Windows, macOS and Linux), because it runs pfpdf as a separate program.

## Requirements

- Obsidian 1.13.0 or later (desktop)
- [Node.js](https://nodejs.org/) 22.12 or later
- pfpdf 0.3.0, installed by you (see below). The plugin does not download or install pfpdf.

### Install pfpdf

Install pfpdf with npm:

```sh
npm install -g @pfnet-research/pfpdf@0.3.0
```

On its first conversion, pfpdf downloads Chromium, the browser it renders PDFs with (several hundred megabytes), and caches it for later runs. Your first export therefore takes longer than later ones.

On Linux, Chromium also needs some system libraries; `pfpdf --doctor` reports what is missing. See [pfpdf's troubleshooting guide](https://github.com/pfnet-research/pfpdf/blob/main/docs/tutorial.en/08_troubleshooting.md).

## Installation

Open **Settings → Community plugins → Browse**, search for **pfpdf Export**, then select **Install** and **Enable**.

To install manually, download `main.js` and `manifest.json` from the [latest release](https://github.com/umiyosh/obsidian-pfpdf-export/releases/latest), put them in `<your vault>/.obsidian/plugins/pfpdf-export/`, reload Obsidian, and enable **pfpdf Export** under **Settings → Community plugins**.

## Usage

- Run **Export current note to PDF** from the command palette, or
- right-click a note in the file explorer and select **Export to PDF with pfpdf**.

Before each export, the plugin runs `pfpdf --version` to check that pfpdf starts. If it does not, the plugin shows why, and how to install pfpdf if it was not found, instead of exporting. **Check pfpdf** in the plugin settings runs the same check.

Set the template and table of contents in the note's front matter:

```yaml
---
title: Quarterly report
author: Jane Doe
template: technical
toc: true
---
```

The plugin passes only the keys pfpdf uses (`title`, `author`, `series`, `template`, `toc`, `date`, `page_size`, `lang`, `dir`, `confidential`, `logo`, `bibliography`), after checking their types. It ignores other keys such as `tags`. Without `title`, the note name is used. `logo` and `bibliography` are paths to files in the vault.

## How Obsidian syntax is converted

pfpdf typesets GitHub Flavored Markdown, so Obsidian-specific syntax is converted before export.

| Syntax                                                             | In the PDF                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `![[image.png]]`, `![[image.png\|300]]`, `![[image.png\|300x200]]` | Image, at the given size                                                            |
| `![alt](relative/path.png)`, `![alt](<path with spaces.png>)`      | Image; the path is resolved from the note                                           |
| `<img src="relative/path.png">`                                    | Image                                                                               |
| `![](https://…)`                                                   | Downloaded and embedded. If the download fails, the URL is kept and a warning shown |
| `![[Note]]`, `![[Note#Heading]]`, `![[Note#^block]]`               | The embedded content. Circular embeds are skipped                                   |
| `![[drawing.excalidraw]]`                                          | The SVG or PNG that the Excalidraw plugin exported automatically                    |
| `[[Link\|alias]]`, Markdown links to notes                         | Plain text, because pfpdf does not accept links outside the document                |
| `> [!note] Title` (callouts)                                       | A coloured box                                                                      |
| `==highlight==`                                                    | Highlight                                                                           |
| `%%comment%%`, `^block-id`                                         | Removed                                                                             |
| `^[inline footnote]`                                               | Footnote                                                                            |
| Code blocks, inline code, math                                     | Unchanged                                                                           |

### Things to know

- A line with only `___` (three or more underscores) is a page break in pfpdf. Use `---` for a horizontal rule.
- Content that another plugin renders, such as Dataview queries, appears as its source code block, because the PDF is typeset from the note's Markdown, not from Obsidian's view.
- HEIC and TIFF images cannot be rendered by Chromium. Convert them to PNG or JPEG.
- If a formula has a syntax error, pfpdf fails without producing a PDF. Write `\$` for a literal dollar sign.

## Settings

| Setting                | Default        | Description                                                            |
| ---------------------- | -------------- | ---------------------------------------------------------------------- |
| Default template       | `default`      | Template used when the front matter has no `template`                  |
| Table of contents      | On             | Whether to add a table of contents when the front matter has no `toc`  |
| Save location          | Ask every time | A save dialog, the note's folder, or a fixed folder in the vault       |
| Open after export      | On             | Opens the PDF in your default PDF viewer                               |
| Pfpdf command          | `pfpdf`        | Command that runs pfpdf. **Check pfpdf** shows whether exports can run |
| Extra arguments        | None           | Arguments added to every pfpdf run, for example `--host-fonts`         |
| Additional search path | None           | Folders to add to PATH if Node.js or pfpdf is not found                |
| Timeout in seconds     | 600            | Time limit for one export                                              |
| Keep work directory    | Off            | Keeps the generated Markdown and copied images for troubleshooting     |

When Obsidian is started from the Dock or Start menu, its PATH contains only system folders. To find Node.js and pfpdf, the plugin adds the PATH of your login shell and common Node.js install locations (Homebrew, Volta, nodebrew, mise, asdf).

You can set **Pfpdf command** to another command, such as `npx @pfnet-research/pfpdf@0.3.0`. Such a command runs as you set it, so if it downloads packages, that is your choice.

## Disclosures

**Network use**

- The plugin downloads remote images (`http` and `https` URLs) in the note you export, using Obsidian's `requestUrl`, so they can be embedded in the PDF. Each download times out after 30 seconds. No other data is sent.
- If such a download fails, the URL is passed to pfpdf, and pfpdf's browser may try to load it. Remote resources in raw HTML in the note can also be loaded by pfpdf's browser.
- The plugin itself never downloads pfpdf or other code. On its first conversion, the pfpdf you installed downloads Chromium, as described in [Install pfpdf](#install-pfpdf).

**Files outside the vault**

- Each export creates a work directory in your system's temporary folder, copies the note's images there, and deletes it afterwards (unless **Keep work directory** is on).
- With **Save location** set to **Ask every time**, you can save the PDF anywhere, including outside the vault.
- With **Open after export** on, the PDF is opened in your system's default PDF viewer.

**External programs**

- The plugin runs pfpdf (the **Pfpdf command** setting) as a separate process, with `--version` to check it and with `--input` and `--output` to export.
- On macOS and Linux, it runs your login shell (`$SHELL -ilc`) once per session to read your PATH. This loads your shell's startup files.

**Other**

- No telemetry. No account or payment is needed.

**Security note**

pfpdf renders raw HTML in notes and runs `<script>` elements, as described in [pfpdf's security policy](https://github.com/pfnet-research/pfpdf/blob/main/SECURITY.md). Do not export notes from sources you do not trust.

## Credits

- [pfpdf](https://github.com/pfnet-research/pfpdf) by pfnet-research (MIT License) does the typesetting. It is not bundled; you install it yourself.
- `main.js` bundles [cross-spawn](https://github.com/moxystudio/node-cross-spawn) and its dependencies (MIT and ISC licenses). Their license texts are at the top of `main.js`.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
