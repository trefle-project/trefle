import { defineConfig } from "vitest/config";

/**
 * 012-url-page-import — tests that drive the real `browser` container
 * (BROWSER_WS_URL) and the `import-fixture` site. Run inside the cms
 * container, where both are reachable:
 *   docker compose -f infra/docker-compose.yml -f infra/docker-compose.override.yml \
 *     exec cms npm run --workspace @trefle/cms test:browser
 * They fail — never skip — when BROWSER_WS_URL is unset.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/browser/**/*.test.ts"],
    testTimeout: 90_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
