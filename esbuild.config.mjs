import { builtinModules } from "node:module";
import process from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import esbuild from "esbuild";
import { bundledPackages, licenseBanner } from "./scripts/license-banner.mjs";

const prod = process.argv[2] === "production";

const context = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/*",
    "@lezer/*",
    ...builtinModules,
    ...builtinModules.map((m) => `node:${m}`),
  ],
  format: "cjs",
  target: "es2021",
  platform: "node",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  outfile: "main.js",
  metafile: prod,
});

if (prod) {
  const { metafile } = await context.rebuild();
  // Only release builds get the notice; prepending in watch mode would shift the inline source map.
  const banner = licenseBanner(bundledPackages(metafile.inputs), process.cwd());
  writeFileSync("main.js", banner + readFileSync("main.js", "utf8"));
  await context.dispose();
} else {
  await context.watch();
}
