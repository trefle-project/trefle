import { describe, expect, it } from "vitest";

import { isBotProtection } from "../src/lib/import/render";

/**
 * 012-url-page-import — a site that refuses automated visits is reported as
 * `blocked` (« protection anti-robots »), not as a page needing a login.
 */
describe("isBotProtection", () => {
  it.each([
    [403, { server: "cloudflare", "cf-ray": "a41c-CDG" }],
    [403, { server: "AkamaiGHost" }],
    [403, { "x-datadome": "protected" }],
    [401, { "x-iinfo": "12-345" }],
    [403, { server: "Sucuri/Cloudproxy", "x-sucuri-id": "1" }],
    [503, { "cf-mitigated": "challenge" }],
    [429, {}],
  ])("%i with %o is bot protection", (status, headers) => {
    expect(isBotProtection(status, headers as Record<string, string>)).toBe(true);
  });

  it.each([
    [403, { server: "nginx" }],
    [401, { "www-authenticate": "Basic" }],
    [200, { server: "cloudflare", "cf-ray": "x" }],
    [404, { server: "AkamaiGHost" }],
  ])("%i with %o is not", (status, headers) => {
    expect(isBotProtection(status, headers as Record<string, string>)).toBe(false);
  });
});
