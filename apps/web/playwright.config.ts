import { defineConfig, devices } from "@playwright/test";

/**
 * `E2E_BASE_URL`   where the renderer answers (default: the local site host).
 * `E2E_START_WEB=1` also boot `next dev` for apps/web (reuses one already up);
 *                   the CMS + docker services must be running separately.
 * `global-setup.ts` seeds the published page + a captured lead before the run.
 */
/**
 * 020-edge-html-cache — `E2E_EDGE=1` runs every spec through the edge Worker
 * (`wrangler dev`, apps/edge/scripts/dev-e2e.sh) at `E2E_EDGE_URL`. Specs and
 * global-setup read `E2E_BASE_URL`, so it is pointed there for the whole run
 * (workers inherit this process's environment).
 */
const EDGE = process.env.E2E_EDGE === "1";
if (EDGE) process.env.E2E_BASE_URL = process.env.E2E_EDGE_URL ?? "http://site-a.localhost:8787";
const BASE_URL = process.env.E2E_BASE_URL ?? "http://site-a.localhost:3001";
/**
 * In the dockerised runner (CI) the browser reaches the host's services
 * through host.docker.internal, but asset URLs name `*.localhost` hosts
 * (Garage: trefle-assets.web.garage.localhost:3902), which resolve to the
 * container itself. Map them to the host; the Host header stays, so Garage
 * still picks the bucket from it.
 */
const IN_DOCKER = (process.env.CMS_URL ?? "").includes("host.docker.internal");
const launchOptions = IN_DOCKER ? { args: ["--host-resolver-rules=MAP *.localhost host.docker.internal"] } : {};
const SHARED_STATE = [/admin-(branding|organisation|timezone|page-stats|members|totp|language)\.spec\.ts$/, /legal-pages\.spec\.ts$/, /us5-roles\.spec\.ts$/, /gtm-consent\.spec\.ts$/, /us-(domain-fonts|site-import)\.spec\.ts$/];

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    launchOptions,
  },
  // 022-ux-improvement — specs that change the shared Settings, the shared
  // admin account or members (operator identity, time zones, names, branding,
  // second factor) run one at
  // a time: a full Settings form saved by one would overwrite another's
  // changes. So do the specs that write the e2e domain's fonts (a site import
  // adds its families to the list another spec just changed). Everything else
  // stays parallel.
  projects: [
    { name: EDGE ? "edge" : "chromium", use: { ...devices["Desktop Chrome"], launchOptions }, testIgnore: SHARED_STATE },
    { name: EDGE ? "edge-shared-state" : "shared-state", use: { ...devices["Desktop Chrome"], launchOptions }, testMatch: SHARED_STATE, workers: 1 },
  ],
  ...(process.env.E2E_START_WEB === "1"
    ? {
        webServer: {
          command: "npm run --workspace @trefle/web dev",
          url: BASE_URL,
          reuseExistingServer: true,
          timeout: 120_000,
        },
      }
    : {}),
});
