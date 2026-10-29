import { countBlocks } from "@trefle/shared";
import { describe, expect, it } from "vitest";

import { builderField } from "../src/fields/grapesjs/field";

/**
 * 003-post-launch-improvements, FR-018/FR-019/FR-020 — a brand-new page's
 * starter content must already satisfy the publish guard's "exactly one
 * lead-form block" rule (pages-publish-guard.ts), the same as any page an
 * editor built by hand.
 */
function fieldDefault(name: string): unknown {
  const fields = (builderField as { fields: { name: string; defaultValue?: unknown }[] }).fields;
  const field = fields.find((f) => f.name === name);
  const dv = field?.defaultValue;
  return typeof dv === "function" ? dv({} as never) : dv;
}

describe("GrapesJS starter template", () => {
  it("projectData default has exactly one lead-form block", () => {
    const counts = countBlocks(fieldDefault("projectData"));
    expect(counts.leadForm).toBe(1);
    expect(counts.total).toBeGreaterThanOrEqual(2); // hero + lead-form at least
  });

  it("html/css defaults are non-empty and the html carries the lead-form marker", () => {
    const html = fieldDefault("html") as string;
    const css = fieldDefault("css") as string;
    expect(html).toContain('data-block="lead-form"');
    expect(typeof css).toBe("string");
  });
});
