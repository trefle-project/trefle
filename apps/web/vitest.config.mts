import { defineConfig } from "vitest/config";

export default defineConfig({
  // 003-post-launch-improvements — api-leads.test.ts renders <PageShell> (a
  // .tsx component) via react-dom/server for the confirmation-page flow.
  // Vite/esbuild's default classic JSX transform needs `React` in scope;
  // Next.js itself uses the automatic runtime (tsconfig's "jsx": "preserve"
  // defers to the bundler), so match that here rather than importing React
  // into every .tsx file just for this test environment.
  esbuild: { jsx: "automatic" },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["tests/e2e/**"],
    passWithNoTests: true,
  },
});
