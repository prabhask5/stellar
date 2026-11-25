import { defineConfig } from "vitest/config";

// Two projects, both discovered by glob: a test file added under tests/unit or tests/db runs
// with no further configuration. Run one with `--project` (see the root package.json).
export default defineConfig({
  root: import.meta.dirname,
  // Aliases come from the nearest tsconfig.json: tests/tsconfig.json for the tests
  // (`@web/*`, `@extension/*`) and each app's own for the sources they import (`@/*`).
  resolve: { tsconfigPaths: true },
  test: {
    // A stray `.only` must fail the run instead of silently skipping every other test.
    allowOnly: false,
    // A project that matches no files is a broken glob, not a pass.
    passWithNoTests: false,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["db/**/*.test.ts"],
          globalSetup: ["db/support/global-setup.ts"],
          // The suites share one database.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
