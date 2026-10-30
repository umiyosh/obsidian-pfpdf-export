import js from "@eslint/js";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

// Thresholds match kotobae. They are warnings so the quality baseline can track and ratchet them.
const metricRules = {
  complexity: ["warn", 20],
  "max-depth": ["warn", 4],
  "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
  "max-lines-per-function": ["warn", { max: 120, skipBlankLines: true, skipComments: true }],
  "max-params": ["warn", 5],
};

const unusedVars = [
  "error",
  { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
];

export default defineConfig([
  {
    ignores: ["main.js", "node_modules", "coverage", ".wt", "tests/.output"],
  },
  {
    files: ["src/**/*.ts"],
    extends: [...obsidianmd.configs.recommended],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: { ...metricRules, "@typescript-eslint/no-unused-vars": unusedVars },
  },
  {
    files: ["tests/**/*.ts", "*.config.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: { ...metricRules, "@typescript-eslint/no-unused-vars": unusedVars },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { globals: globals.node },
    rules: metricRules,
  },
]);
