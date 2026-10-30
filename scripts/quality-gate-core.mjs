// Ported from kotobae's quality gate, keeping only the TypeScript tools (ESLint and knip).

export const QUALITY_BASELINE_VERSION = 2;
export const QUALITY_BASELINE_POLICY =
  "Every current quality violation is a repayment target. The baseline exists to prevent increases and track reductions.";
export const REFUSE_WORSENED_BASELINE_MESSAGE =
  "Refusing to update quality baseline because current violations are worse than the baseline.\nFix the regression instead of ratcheting the baseline upward.";

const ESLINT_METRIC_PARSERS = [
  {
    category: "complexity",
    name: "complexity",
    pattern:
      /^(?:Function '.+'|Arrow function|Method '.+'|.+) has a complexity of (\d+). Maximum allowed is (\d+)\.$/,
  },
  {
    category: "max-lines-per-function",
    name: "functionLines",
    pattern:
      /^(?:Function '.+'|Arrow function|Method '.+'|.+) has too many lines \((\d+)\). Maximum allowed is (\d+)\.$/,
  },
  {
    category: "max-lines",
    name: "lines",
    pattern: /^File has too many lines \((\d+)\). Maximum allowed is (\d+)\.$/,
  },
  {
    category: "max-params",
    name: "arguments",
    pattern:
      /^(?:Function '.+'|Arrow function|Method '.+'|.+) has too many parameters \((\d+)\). Maximum allowed is (\d+)\.$/,
  },
  {
    category: "max-depth",
    name: "depth",
    pattern: /^Blocks are nested too deeply \((\d+)\). Maximum allowed is (\d+)\.$/,
  },
];

export function issueId(parts) {
  return parts.map((part) => String(part).replaceAll("|", "/")).join("|");
}

export function parseQualityGateArgs(args) {
  const options = { updateBaseline: false, initBaseline: false };
  for (const arg of args) {
    if (arg === "--update-baseline") {
      options.updateBaseline = true;
    } else if (arg === "--init-baseline") {
      options.initBaseline = true;
    } else {
      throw new Error(`Unknown quality gate argument: ${arg}`);
    }
  }
  return options;
}

export function parseMetricFromEslintMessage(message, category = "") {
  for (const parser of ESLINT_METRIC_PARSERS) {
    if (category && parser.category !== category) {
      continue;
    }
    const match = message.match(parser.pattern);
    if (match) {
      return lowerIsBetterMetric(parser.name, match[1], match[2]);
    }
  }
  return undefined;
}

export function buildStableKey(issue) {
  if (issue.stableKey) {
    return issue.stableKey;
  }
  if (issue.tool === "eslint") {
    return buildEslintStableKey(issue);
  }
  return issue.id;
}

export function normalizeIssue(issue) {
  const normalized = { ...issue, line: issue.line ?? null, column: issue.column ?? null };
  const metric =
    normalized.metric ??
    (normalized.tool === "eslint"
      ? parseMetricFromEslintMessage(normalized.detail, normalized.category)
      : undefined);
  if (metric) {
    normalized.metric = metric;
  }
  normalized.stableKey = buildStableKey(normalized);
  return normalized;
}

export function normalizeIssues(issues) {
  return dedupeIssues(issues.map((issue) => normalizeIssue(issue)));
}

export function dedupeIssues(issues) {
  const byKey = new Map();
  for (const issue of issues) {
    byKey.set(comparisonKey(issue), issue);
  }
  return [...byKey.values()].sort((a, b) => comparisonKey(a).localeCompare(comparisonKey(b)));
}

export function compareIssues({ currentIssues, baselineIssues }) {
  const normalizedCurrentIssues = normalizeIssues(currentIssues);
  const normalizedBaselineIssues = normalizeIssues(baselineIssues);
  const currentByKey = new Map(normalizedCurrentIssues.map((i) => [comparisonKey(i), i]));
  const baselineByKey = new Map(normalizedBaselineIssues.map((i) => [comparisonKey(i), i]));

  const newIssues = normalizedCurrentIssues.filter((i) => !baselineByKey.has(comparisonKey(i)));
  const resolvedIssues = normalizedBaselineIssues.filter(
    (i) => !currentByKey.has(comparisonKey(i))
  );
  const { worsenedIssues, improvedIssues } = compareSharedMetricIssues(currentByKey, baselineByKey);

  return {
    currentIssues: normalizedCurrentIssues,
    baselineIssues: normalizedBaselineIssues,
    newIssues,
    resolvedIssues,
    worsenedIssues,
    improvedIssues,
  };
}

export function canUpdateBaseline(comparison, hasExistingBaseline = true) {
  if (!hasExistingBaseline) {
    return { allowed: true, reason: "initial baseline" };
  }
  if (comparison.newIssues.length > 0 || comparison.worsenedIssues.length > 0) {
    return { allowed: false, reason: REFUSE_WORSENED_BASELINE_MESSAGE };
  }
  return { allowed: true, reason: "baseline does not move upward" };
}

export function buildBaselineDocument({ issues, thresholds }) {
  return {
    version: QUALITY_BASELINE_VERSION,
    policy: QUALITY_BASELINE_POLICY,
    thresholds,
    issues: normalizeIssues(issues),
  };
}

export function buildSummary(comparison) {
  const counts = {
    current: summarizeByTool(comparison.currentIssues),
    baseline: summarizeByTool(comparison.baselineIssues),
    new: summarizeByTool(comparison.newIssues),
    resolved: summarizeByTool(comparison.resolvedIssues),
    worsened: summarizeByTool(comparison.worsenedIssues.map((c) => c.current)),
    improved: summarizeByTool(comparison.improvedIssues.map((c) => c.current)),
  };
  const tools = [...new Set(Object.values(counts).flatMap((m) => [...m.keys()]))].sort();
  const columns = Object.keys(counts);

  const lines = [
    "## Quality Baseline",
    "",
    `| tool | ${columns.join(" | ")} |`,
    `|---|${columns.map(() => "---:").join("|")}|`,
  ];
  for (const tool of tools) {
    lines.push(`| ${tool} | ${columns.map((c) => counts[c].get(tool) ?? 0).join(" | ")} |`);
  }

  appendSection(lines, "New violations", comparison.newIssues, issueLabel);
  appendSection(lines, "Resolved baseline entries", comparison.resolvedIssues, issueLabel);
  appendSection(lines, "Worsened baseline entries", comparison.worsenedIssues, comparisonLabel);
  appendSection(lines, "Improved baseline entries", comparison.improvedIssues, comparisonLabel);

  lines.push("", "Baseline entries are repayment targets, not permanent allowances.");
  return `${lines.join("\n")}\n`;
}

export function comparisonHasChanges(comparison) {
  return (
    comparison.newIssues.length > 0 ||
    comparison.resolvedIssues.length > 0 ||
    comparison.worsenedIssues.length > 0 ||
    comparison.improvedIssues.length > 0
  );
}

function buildEslintStableKey(issue) {
  if (issue.category === "max-lines") {
    return issueId(["eslint", issue.category, issue.path, "file"]);
  }
  const functionName = parseFunctionName(issue.detail);
  if (functionName) {
    return issueId(["eslint", issue.category, issue.path, `function:${functionName}`]);
  }
  if (ESLINT_METRIC_PARSERS.some((p) => p.category === issue.category)) {
    return issueId(["eslint", issue.category, issue.path, lineColumnKey(issue)]);
  }
  return issue.id;
}

function lowerIsBetterMetric(name, value, limit) {
  return { name, value: Number(value), limit: Number(limit), direction: "lowerIsBetter" };
}

function parseFunctionName(detail) {
  return detail.match(/^(?:Function|Method|Async function|Async method) '([^']+)' /)?.[1];
}

function lineColumnKey(issue) {
  return `line:${issue.line ?? "unknown"}:column:${issue.column ?? "unknown"}`;
}

function comparisonKey(issue) {
  return issue.stableKey ?? issue.id;
}

function compareSharedMetricIssues(currentByKey, baselineByKey) {
  const worsenedIssues = [];
  const improvedIssues = [];
  for (const [key, baseline] of baselineByKey) {
    const current = currentByKey.get(key);
    if (!current || !isComparableMetric(current.metric, baseline.metric)) {
      continue;
    }
    const delta = current.metric.value - baseline.metric.value;
    if (delta > 0) {
      worsenedIssues.push({ baseline, current, delta });
    } else if (delta < 0) {
      improvedIssues.push({ baseline, current, delta });
    }
  }
  return { worsenedIssues, improvedIssues };
}

function isComparableMetric(currentMetric, baselineMetric) {
  return Boolean(
    currentMetric &&
    baselineMetric &&
    currentMetric.name === baselineMetric.name &&
    currentMetric.direction === "lowerIsBetter" &&
    baselineMetric.direction === "lowerIsBetter"
  );
}

function summarizeByTool(issues) {
  const counts = new Map();
  for (const issue of issues) {
    counts.set(issue.tool, (counts.get(issue.tool) ?? 0) + 1);
  }
  return counts;
}

function appendSection(lines, title, items, label) {
  if (items.length === 0) {
    return;
  }
  lines.push("", `### ${title}`);
  for (const item of items.slice(0, 50)) {
    lines.push(`- ${label(item)}`);
  }
  if (items.length > 50) {
    lines.push(`- ...and ${items.length - 50} more`);
  }
}

function issueLabel(issue) {
  const location = issue.line ? `${issue.path}:${issue.line}` : issue.path;
  return `${issue.tool} ${issue.category} ${location} ${issue.detail}`;
}

function comparisonLabel({ baseline, current, delta }) {
  const metricName = current.metric.name;
  const sign = delta > 0 ? "+" : "";
  return `${current.tool} ${current.category} ${current.path} ${comparisonSubject(current)} baseline: ${baseline.metric.value} ${metricName}, current: ${current.metric.value} ${metricName}, delta: ${sign}${delta}`;
}

function comparisonSubject(issue) {
  const functionName = parseFunctionName(issue.detail);
  if (functionName) {
    return `function:${functionName}`;
  }
  if (issue.category === "max-lines") {
    return "file";
  }
  return issue.line ? `line:${issue.line}` : "";
}
