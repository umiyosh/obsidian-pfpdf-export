// Stands in for pfpdf in unit tests: validates the generated input and writes a placeholder PDF.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];

// --doctor reports the browser as --fake-browser says: pass, missing, fail or garbage.
if (args.includes("--doctor")) {
  const browser = {
    pass: { status: "pass", message: "browser launched successfully: /cache/chrome" },
    missing: {
      status: "warning",
      message: "managed browser is not installed yet; conversion will attempt to download it",
    },
    fail: { status: "fail", message: "browser exited before startup" },
  }[value("--fake-browser") ?? "pass"];
  if (!browser) {
    process.stdout.write("unknown option --doctor\n");
    process.exit(2);
  }
  const checks = [
    { id: "node-version", status: "pass", message: "Node.js 22.12.0" },
    { id: "browser", ...browser },
  ];
  const status = browser.status;
  process.stdout.write(
    `${JSON.stringify({ schemaVersion: 2, command: "doctor", status, checks })}\n`
  );
  process.exit(status === "fail" ? 1 : 0);
}

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
