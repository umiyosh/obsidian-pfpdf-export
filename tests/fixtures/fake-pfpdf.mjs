// Stands in for pfpdf in unit tests: validates the generated input and writes a placeholder PDF.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const input = value("--input");
const output = value("--output");
const markdown = readFileSync(input, "utf8");

process.stderr.write("pfpdf: warn: SOURCE_DATE_EPOCH is not set; this build is not reproducible\n");
if (args.includes("--sleep")) {
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
if (markdown.includes("FAIL_PFPDF")) {
  process.stderr.write("\u001b[91mERROR\u001b[39m Error: MathJax reported a TeX error\n");
  process.exit(2);
}
const missing = [...markdown.matchAll(/(?:\]\(|src=")(assets\/[^)"]+)/g)]
  .map((m) => m[1])
  .filter((asset) => !existsSync(join(dirname(input), asset)));
if (missing.length > 0) {
  process.stderr.write(`ERROR missing assets: ${missing.join(", ")}\n`);
  process.exit(1);
}
process.stderr.write("pfpdf: warn: unknown front matter key: cssclasses\n");
writeFileSync(output, `%PDF-1.7 fake\n${args.join(" ")}\n`);
