# Contributing

Bug reports and pull requests are welcome. For a large change, open an issue first so we can agree on the approach.

## Development environment

- Node.js 22.12 or later and npm
- GNU Make
- For `make e2e`: [poppler](https://poppler.freedesktop.org/) (`pdfimages`, `pdftotext`, `pdftoppm`)
- For `make e2e-obsidian`: macOS with Obsidian installed in `/Applications`

```sh
npm ci
make build   # writes main.js
```

To try the plugin, copy `main.js` and `manifest.json` into `<a test vault>/.obsidian/plugins/pfpdf-export/` and enable it. Use a vault you do not mind changing.

## Checks

Run all checks before opening a pull request. CI runs the same checks.

```sh
make check
```

`make check` runs ESLint (including the recommended rules of `eslint-plugin-obsidianmd`), Prettier, the TypeScript compiler, the quality baseline (complexity, nesting, file and function length, parameters, and unused code found by knip), the unit tests, the 80% coverage gate and the build. `make help` lists every target.

If you change what ends up in the PDF, also run the end-to-end tests. Both start Chromium.

```sh
make e2e           # converts a fixture note with the real pfpdf and checks the images in the PDF
make e2e-obsidian  # runs the export command in an isolated Obsidian instance (macOS)
```

The end-to-end tests run pfpdf with `npx -y @pfnet-research/pfpdf@0.3.0` unless `PFPDF_COMMAND` is set, so you do not need a global install. `make e2e-obsidian` uses its own user data directory and does not touch your running Obsidian or your vaults.

## Code rules

- Do not add quality violations. `quality-baseline.json` starts at zero, and `make quality-baseline` refuses to record a worse state.
- Do not silence type errors with `any` or type assertions; narrow unknown values instead.
- Start a behaviour change with a failing test.
- Write comments that explain why, not what.
- The plugin must not download or install code at run time (Obsidian developer policy). Network access and files outside the vault must be listed under **Disclosures** in both READMEs.

## Pull requests

1. Create a branch from `master`.
2. Make your change with tests, and run `make check` (and the end-to-end tests if the PDF output changes).
3. Update `README.md` and `README.ja.md` if users will notice the change.
4. Open a pull request that says what changed, why, and how you tested it. Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/), for example `fix: keep image size in callouts`.
