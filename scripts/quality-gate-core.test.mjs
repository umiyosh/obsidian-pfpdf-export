import test from "node:test";
import assert from "node:assert/strict";
import {
  REFUSE_WORSENED_BASELINE_MESSAGE,
  buildBaselineDocument,
  buildSummary,
  canUpdateBaseline,
  compareIssues,
  comparisonHasChanges,
  normalizeIssue,
  parseMetricFromEslintMessage,
  parseQualityGateArgs,
} from "./quality-gate-core.mjs";

test("existing max-lines が悪化したら worsenedIssues になる", () => {
  const comparison = compareIssues({
    baselineIssues: [fileLinesIssue(520, 501)],
    currentIssues: [fileLinesIssue(640, 501)],
  });

  assert.equal(comparison.worsenedIssues.length, 1);
  assert.equal(comparison.worsenedIssues[0].delta, 120);
  assert.equal(comparison.newIssues.length, 0);
  assert.equal(comparison.resolvedIssues.length, 0);
});

test("existing max-lines が改善したら improvedIssues になる", () => {
  const comparison = compareIssues({
    baselineIssues: [fileLinesIssue(640, 501)],
    currentIssues: [fileLinesIssue(520, 501)],
  });

  assert.equal(comparison.improvedIssues.length, 1);
  assert.equal(comparison.improvedIssues[0].delta, -120);
});

test("existing max-lines が同値なら差分なしになる", () => {
  const comparison = compareIssues({
    baselineIssues: [fileLinesIssue(520, 501)],
    currentIssues: [fileLinesIssue(520, 700)],
  });

  assert.equal(comparisonHasChanges(comparison), false);
});

test("issue が消えたら resolvedIssues になる", () => {
  const comparison = compareIssues({
    baselineIssues: [fileLinesIssue(520, 501)],
    currentIssues: [],
  });

  assert.equal(comparison.resolvedIssues.length, 1);
  assert.equal(comparisonHasChanges(comparison), true);
});

test("新しい issue が出たら newIssues になる", () => {
  const comparison = compareIssues({
    baselineIssues: [],
    currentIssues: [fileLinesIssue(520, 501)],
  });

  assert.equal(comparison.newIssues.length, 1);
});

test("関数の違反は行番号が変わっても stableKey で比較される", () => {
  const comparison = compareIssues({
    baselineIssues: [functionLinesIssue(130, 10)],
    currentIssues: [functionLinesIssue(130, 42)],
  });

  assert.equal(
    comparison.currentIssues[0].stableKey,
    "eslint|max-lines-per-function|src/convert/markdown.ts|function:convertBody"
  );
  assert.equal(comparisonHasChanges(comparison), false);
});

test("名前のない関数の違反は行と列で stableKey を持つ", () => {
  const normalized = normalizeIssue({
    id: "eslint|max-lines-per-function|tests/convert.test.ts|12|30",
    tool: "eslint",
    category: "max-lines-per-function",
    path: "tests/convert.test.ts",
    line: 12,
    column: 30,
    detail: "Arrow function has too many lines (290). Maximum allowed is 120.",
  });

  assert.equal(
    normalized.stableKey,
    "eslint|max-lines-per-function|tests/convert.test.ts|line:12:column:30"
  );
  assert.equal(normalized.metric.value, 290);
});

test("quality:update-baseline は worsenedIssues がある場合に拒否される", () => {
  const comparison = compareIssues({
    baselineIssues: [fileLinesIssue(520, 501)],
    currentIssues: [fileLinesIssue(640, 501)],
  });

  const decision = canUpdateBaseline(comparison, true);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, REFUSE_WORSENED_BASELINE_MESSAGE);
});

test("quality:update-baseline は newIssues がある場合に拒否される", () => {
  const comparison = compareIssues({
    baselineIssues: [],
    currentIssues: [fileLinesIssue(520, 501)],
  });

  assert.equal(canUpdateBaseline(comparison, true).allowed, false);
});

test("quality:update-baseline は improvedIssues と resolvedIssues のみなら許可される", () => {
  const improved = compareIssues({
    baselineIssues: [fileLinesIssue(640, 501)],
    currentIssues: [fileLinesIssue(520, 501)],
  });
  const resolved = compareIssues({ baselineIssues: [fileLinesIssue(520, 501)], currentIssues: [] });

  assert.equal(canUpdateBaseline(improved, true).allowed, true);
  assert.equal(canUpdateBaseline(resolved, true).allowed, true);
  assert.equal(canUpdateBaseline(improved, false).reason, "initial baseline");
});

test("baseline document は version 2 と normalized issue を書き出す", () => {
  const baseline = buildBaselineDocument({ issues: [fileLinesIssue(520, 501)], thresholds: {} });

  assert.equal(baseline.version, 2);
  assert.equal(baseline.issues[0].stableKey, "eslint|max-lines|src/convert/markdown.ts|file");
  assert.equal(baseline.issues[0].metric.value, 520);
});

test("knip の issue は id で比較される", () => {
  const issue = {
    id: "knip|exports|src/convert/links.ts|unusedHelper",
    tool: "knip",
    category: "exports",
    path: "src/convert/links.ts",
    line: 3,
    detail: "unusedHelper",
  };
  const comparison = compareIssues({ baselineIssues: [issue], currentIssues: [{ ...issue }] });

  assert.equal(comparison.currentIssues[0].stableKey, issue.id);
  assert.equal(comparison.currentIssues[0].metric, undefined);
  assert.equal(comparisonHasChanges(comparison), false);
});

test("summary に worsened と improved の列とセクションが表示される", () => {
  const comparison = compareIssues({
    baselineIssues: [fileLinesIssue(520, 501), functionLinesIssue(200, 10)],
    currentIssues: [fileLinesIssue(640, 501), functionLinesIssue(150, 10)],
  });

  const summary = buildSummary(comparison);
  assert.match(summary, /worsened \| improved/);
  assert.match(summary, /### Worsened baseline entries/);
  assert.match(summary, /### Improved baseline entries/);
  assert.match(summary, /function:convertBody/);
});

test("ESLint metric parser は複雑度・ネスト・引数・メソッドの metric を読む", () => {
  assert.equal(
    parseMetricFromEslintMessage(
      "Method 'onload' has a complexity of 23. Maximum allowed is 20.",
      "complexity"
    )?.value,
    23
  );
  assert.equal(
    parseMetricFromEslintMessage("Blocks are nested too deeply (6). Maximum allowed is 4.")?.name,
    "depth"
  );
  assert.equal(
    parseMetricFromEslintMessage(
      "Function 'run' has too many parameters (7). Maximum allowed is 5.",
      "max-params"
    )?.value,
    7
  );
  assert.equal(parseMetricFromEslintMessage("unrelated", "complexity"), undefined);
});

test("quality gate args は baseline 更新指定を解釈し、未知の引数を拒否する", () => {
  assert.deepEqual(parseQualityGateArgs(["--update-baseline"]), {
    updateBaseline: true,
    initBaseline: false,
  });
  assert.deepEqual(parseQualityGateArgs(["--init-baseline"]), {
    updateBaseline: false,
    initBaseline: true,
  });
  assert.throws(() => parseQualityGateArgs(["--scope=rust"]), /Unknown quality gate argument/);
});

function fileLinesIssue(value, line) {
  return {
    id: `eslint|max-lines|src/convert/markdown.ts|${line}|1`,
    tool: "eslint",
    category: "max-lines",
    path: "src/convert/markdown.ts",
    line,
    column: 1,
    detail: `File has too many lines (${value}). Maximum allowed is 500.`,
  };
}

function functionLinesIssue(value, line) {
  return {
    id: `eslint|max-lines-per-function|src/convert/markdown.ts|${line}|8`,
    tool: "eslint",
    category: "max-lines-per-function",
    path: "src/convert/markdown.ts",
    line,
    column: 8,
    detail: `Function 'convertBody' has too many lines (${value}). Maximum allowed is 120.`,
  };
}
