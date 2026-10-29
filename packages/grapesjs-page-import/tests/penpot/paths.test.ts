import { describe, expect, it } from "vitest";

import { proposePaths, slug } from "../../src/penpot/paths";

/** 015-penpot-site-import T008 — research P13. */

describe("slug", () => {
  it.each([
    ["À propos", "a-propos"],
    ["Mentions légales", "mentions-legales"],
    ["  Nos   Services !! ", "nos-services"],
    ["★", "page"],
    ["/", "page"],
    ["Été 2026 — Offre", "ete-2026-offre"],
  ])("%s → %s", (name, expected) => expect(slug(name)).toBe(expected));

  it("truncates to 60 characters without a trailing dash", () => {
    const s = slug("a".repeat(59) + " bbbb");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("proposePaths", () => {
  it("first board is /, the others their slug, duplicates numbered", () => {
    expect(proposePaths(["Accueil", "Article", "Article", "À propos", "★", "★"])).toEqual([
      "/",
      "/article",
      "/article-2",
      "/a-propos",
      "/page",
      "/page-2",
    ]);
  });
  it("empty list → empty list", () => expect(proposePaths([])).toEqual([]));
});
