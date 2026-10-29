import { defineConfig } from "vitest/config";

/**
 * 020-edge-html-cache — tests that need real Postgres (atomic counters,
 * row locks). They create a throwaway schema with copies of the tables they
 * use and drop it afterwards; the real data is never touched. Needs
 * DATABASE_URL (apps/cms/.env.local on the host, set in the cms container):
 *   npm run --workspace @trefle/cms test:db
 * They fail — never skip — when DATABASE_URL is unset.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    testTimeout: 30_000,
    fileParallelism: false,
  },
});
