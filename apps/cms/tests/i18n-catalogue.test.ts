import { describe, expect, it } from "vitest";

import { en } from "../src/i18n/en";
import { adminText, sameInBoth } from "../src/i18n";
import { fr } from "../src/i18n/fr";

/** 023-admin-i18n (T003, FR-010) — both catalogues have the same keys, no empty text, the same placeholders. */
type Tree = { [key: string]: string | Tree };

function leaves(tree: Tree, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of Object.entries(tree)) {
    if (typeof value === "string") out.set(prefix + key, value);
    else for (const [k, v] of leaves(value, `${prefix}${key}.`)) out.set(k, v);
  }
  return out;
}

const placeholders = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]).sort();

describe("admin catalogues", () => {
  const frLeaves = leaves(fr as unknown as Tree);
  const enLeaves = leaves(en as unknown as Tree);

  it("have exactly the same keys", () => {
    expect([...enLeaves.keys()].sort()).toEqual([...frLeaves.keys()].sort());
  });

  it("have the same groups", () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
  });

  it("have no empty text", () => {
    for (const [key, text] of [...frLeaves, ...enLeaves]) expect(text.trim(), key).not.toBe("");
  });

  it("use the same {{placeholders}} in both languages", () => {
    for (const [key, text] of frLeaves) expect(placeholders(enLeaves.get(key) ?? ""), key).toEqual(placeholders(text));
  });
});

describe("adminText", () => {
  it("reads a dotted key in the member's language, with its placeholders", () => {
    expect(adminText("fr")("ab.runningCount", { n: 2 })).toBe("Tests actuellement en cours\u00a0: 2");
    expect(adminText("en")("ab.runningCount", { n: 2 })).toBe("Tests running now: 2");
  });

  it("reads English for any other language, like Payload's fallback", () => {
    expect(adminText(undefined)("common.apply")).toBe("Apply");
    expect(adminText("de")("common.apply")).toBe("Apply");
  });

  it("leaves a placeholder without a value as it is", () => {
    expect(adminText("en")("pageStats.period", { from: "01/10/2026" })).toBe("From 01/10/2026 to {{to}}");
  });

  it("sameInBoth: today's English label, the same in both admins", () => {
    expect(sameInBoth("Reports")).toEqual({ fr: "Reports", en: "Reports" });
  });
});
