import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportOnFailure: true,
      include: ["src/**/*.ts"],
      // Obsidian glue needs the running app; it is verified by the real-Obsidian E2E run instead.
      exclude: [
        "src/main.ts",
        "src/settings.ts",
        "src/export-action.ts",
        "src/electron.ts",
        "src/export/obsidian-io.ts",
      ],
      thresholds: { lines: 80, branches: 80, functions: 80, statements: 80, perFile: false },
    },
  },
});
