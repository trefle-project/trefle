import type { Browser } from "playwright-core";

import { connectBrowser } from "../../src/lib/import/render";

/** The stack's browser container. Missing config is a failure, not a skip. */
export async function stackBrowser(): Promise<Browser> {
  if (!process.env.BROWSER_WS_URL) {
    throw new Error("BROWSER_WS_URL is not set: run test:browser inside the cms container of the running stack");
  }
  return connectBrowser();
}

export const FIXTURE_ORIGIN = process.env.IMPORT_FIXTURE_ORIGIN ?? "http://import-fixture";
