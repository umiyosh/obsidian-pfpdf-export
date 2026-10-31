// Builds the comment at the top of main.js that carries the licenses of the bundled packages.
// Releases ship main.js alone, and MIT and ISC require the notice in every copy.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Package directories (e.g. node_modules/a/node_modules/b) among esbuild metafile inputs. */
export function bundledPackages(inputs) {
  const dirs = new Set();
  for (const file of Object.keys(inputs)) {
    const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(file);
    if (match) dirs.add(match[1]);
  }
  return [...dirs].sort();
}

function licenseText(dir) {
  const file = readdirSync(dir).find((name) => /^licen[cs]e/i.test(name));
  if (!file) throw new Error(`No license file in ${dir}; add its notice by hand.`);
  return readFileSync(join(dir, file), "utf8").trim();
}

export function licenseBanner(packageDirs, root) {
  const sections = packageDirs.map((rel) => {
    const dir = join(root, rel);
    const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    return `${pkg.name} ${pkg.version} (${pkg.license})\n\n${licenseText(dir)}`;
  });
  const body = [
    "pfpdf Export, https://github.com/umiyosh/obsidian-pfpdf-export (MIT License)",
    "This file bundles the following third-party packages.",
    ...sections,
  ]
    .join("\n\n")
    // A license text must not end the comment early.
    .replaceAll("*/", "* /");
  return `/*\n${body}\n*/\n`;
}
