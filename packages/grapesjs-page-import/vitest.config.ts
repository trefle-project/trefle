import { defineConfig } from "vitest/config";

export default defineConfig({
  // GrapesJS needs a DOM even in headless mode.
  test: { environment: "jsdom", include: ["tests/**/*.test.ts"] },
});
