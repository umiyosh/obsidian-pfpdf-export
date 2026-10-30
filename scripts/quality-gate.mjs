#!/usr/bin/env node

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildBaselineDocument,
  buildSummary,
  canUpdateBaseline,
  compareIssues,
  comparisonHasChanges,
  issueId,
  normalizeIssues,
  parseQualityGateArgs,
} from "./quality-gate-core.mjs";

const repoRoot = process.cwd();
const baselinePath = resolve(repoRoot, "quality-baseline.json");
const options = parseQualityGateArgs(process.argv.slice(2));

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 200 * 1024 * 1024,
    shell: false,
  });
  return { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

function normalizePath(path) {
  return relative(repoRoot, resolve(repoRoot, path)).replaceAll("\\", "/");
}

function collectEslintIssues() {
  const result = run("npx", ["eslint", ".", "--format", "json"]);
  if (![0, 1].includes(result.status)) {
    throw new Error(`ESLint failed:\n${result.stdout}\n${result.stderr}`);
  }
  const issues = [];
  for (const report of JSON.parse(result.stdout)) {
    const filePath = normalizePath(report.filePath);
    // Errors already fail `make lint`; the baseline tracks the warning-level metrics.
    for (const message of (report.messages ?? []).filter((m) => m.severity === 1)) {
      const rule = message.ruleId ?? "unknown";
      issues.push({
        id: issueId(["eslint", rule, filePath, message.line, message.column]),
        tool: "eslint",
        category: rule,
        path: filePath,
        line: message.line,
        column: message.column,
        detail: message.message,
      });
    }
  }
  return issues;
}

function collectKnipIssues() {
  const result = run("npx", ["knip", "--reporter", "json", "--no-exit-code"]);
  if (result.status !== 0) {
    throw new Error(`Knip failed:\n${result.stdout}\n${result.stderr}`);
  }
  const report = JSON.parse(result.stdout || '{"issues":[]}');
  return (report.issues ?? []).flatMap((fileReport) => knipFileIssues(fileReport));
}

// knip's JSON reporter groups findings per file, keyed by issue type.
function knipFileIssues(fileReport) {
  const path = fileReport.file ? normalizePath(fileReport.file) : "";
  return Object.entries(fileReport)
    .filter(([, value]) => Array.isArray(value))
    .flatMap(([type, entries]) =>
      entries.map((entry) => {
        const symbol = entry.name ?? entry.symbol ?? "";
        return {
          id: issueId(["knip", type, path, symbol]),
          tool: "knip",
          category: type,
          path,
          line: entry.line ?? null,
          detail: symbol || JSON.stringify(entry),
        };
      })
    );
}

function loadBaseline() {
  if (!existsSync(baselinePath)) {
    throw new Error("quality-baseline.json is missing. Run `make quality-baseline` first.");
  }
  return JSON.parse(readFileSync(baselinePath, "utf8"));
}

function writeSummary(summary) {
  process.stdout.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
  }
}

function writeBaseline(issues) {
  const baseline = buildBaselineDocument({ issues, thresholds: {} });
  writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
}

function handleBaselineUpdate(currentIssues) {
  if (options.initBaseline || !existsSync(baselinePath)) {
    writeBaseline(currentIssues);
    writeSummary(buildSummary(compareIssues({ currentIssues, baselineIssues: currentIssues })));
    return;
  }
  const comparison = compareIssues({ currentIssues, baselineIssues: loadBaseline().issues ?? [] });
  writeSummary(buildSummary(comparison));
  const decision = canUpdateBaseline(comparison, true);
  if (!decision.allowed) {
    process.stderr.write(`${decision.reason}\n`);
    process.exit(1);
  }
  writeBaseline(currentIssues);
}

const currentIssues = normalizeIssues([...collectEslintIssues(), ...collectKnipIssues()]);

if (options.updateBaseline || options.initBaseline) {
  handleBaselineUpdate(currentIssues);
  process.exit(0);
}

const comparison = compareIssues({ currentIssues, baselineIssues: loadBaseline().issues ?? [] });
writeSummary(buildSummary(comparison));
if (comparisonHasChanges(comparison)) {
  process.exit(1);
}
