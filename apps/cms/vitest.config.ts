import { defineConfig } from "vitest/config";

export default defineConfig({
  // Server components are plain functions returning JSX; compile it the way
  // Next does (automatic runtime) so tests can call them directly.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Need the stack's `browser` container: run with `npm run test:browser`;
    // need Postgres: `npm run test:db` (020).
    exclude: ["tests/browser/**", "tests/db/**", "node_modules/**"],
    passWithNoTests: true,
  },
});
