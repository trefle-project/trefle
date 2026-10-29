import { countBlocks } from "@trefle/shared";
import { describe, expect, it } from "vitest";

import { STARTER_TEMPLATES } from "../src/fields/grapesjs/starterTemplates";
import { templatesFor } from "../src/fields/grapesjs/starterTemplateOptions";
import { applyStarterTemplate } from "../src/hooks/pages-starter-template";

describe("STARTER_TEMPLATES (004-page-types, FR-008/FR-009/FR-010/FR-011)", () => {
  it("subscription starter satisfies the subscription publish rule (exactly one lead-form block)", () => {
    const counts = countBlocks(STARTER_TEMPLATES.subscription[0].projectData);
    expect(counts.leadForm).toBe(1);
  });

  it("free starter satisfies the free publish rule (zero lead-form blocks)", () => {
    const counts = countBlocks(STARTER_TEMPLATES.free[0].projectData);
    expect(counts.leadForm).toBe(0);
  });

  it("confirmation starter satisfies the confirmation publish rule (zero lead-form blocks + placeholder)", () => {
    const counts = countBlocks(STARTER_TEMPLATES.confirmation[0].projectData);
    expect(counts.leadForm).toBe(0);
    expect(STARTER_TEMPLATES.confirmation[0].html).toContain("{{unsubscribeUrl}}");
  });

  it("subscription starter's raw html carries the lead-form block's own centring style, not just its id", () => {
    // Regression guard: this used to be a hand-typed `<div data-block=
    // "lead-form" id="form"></div>` with no `style` at all, independent of
    // blocks.ts's GJS_BLOCKS — so a page's *raw* builder.html/.css (used
    // until the editor's first real save) rendered, and once published,
    // the real form left-aligned instead of centred.
    const html = STARTER_TEMPLATES.subscription[0].html;
    expect(html).toContain('id="form"');
    expect(html).toContain("max-width:480px");
    expect(html).toContain("margin:0 auto");
  });
});

describe("templatesFor (T023)", () => {
  it("lists each type's template(s) as {id, label} without leaking content", () => {
    for (const pageType of ["subscription", "free", "confirmation"] as const) {
      const options = templatesFor(pageType);
      expect(options).toEqual(STARTER_TEMPLATES[pageType].map(({ id, label }) => ({ id, label })));
      expect(options[0]).not.toHaveProperty("projectData");
    }
  });
});

describe("applyStarterTemplate (T016)", () => {
  it("does nothing on update", () => {
    const data: Record<string, unknown> = { pageType: "free", builder: {} };
    const out = applyStarterTemplate({ data, operation: "update" } as never) as Record<string, unknown>;
    expect(out.builder).toEqual({});
  });

  it("does nothing when pageType is subscription (field default already correct)", () => {
    const data: Record<string, unknown> = { pageType: "subscription", builder: {} };
    const out = applyStarterTemplate({ data, operation: "create" } as never) as Record<string, unknown>;
    expect(out.builder).toEqual({});
  });

  it("swaps an empty builder for the type's starter on create", () => {
    const data: Record<string, unknown> = { pageType: "free", builder: {} };
    const out = applyStarterTemplate({ data, operation: "create" } as never) as { builder: { html?: string } };
    expect(out.builder.html).toBe(STARTER_TEMPLATES.free[0].html);
  });

  it("swaps the untouched subscription field-default for the confirmation starter on create", () => {
    const sub = STARTER_TEMPLATES.subscription[0];
    const data: Record<string, unknown> = {
      pageType: "confirmation",
      builder: { projectData: sub.projectData, html: sub.html, css: sub.css },
    };
    const out = applyStarterTemplate({ data, operation: "create" } as never) as { builder: { html?: string } };
    expect(out.builder.html).toBe(STARTER_TEMPLATES.confirmation[0].html);
  });

  it("leaves an already-customised builder untouched", () => {
    const customProjectData = { pages: [{ frames: [{ component: { type: "wrapper", components: [] } }] }] };
    const data: Record<string, unknown> = {
      pageType: "free",
      builder: { projectData: customProjectData, html: "<p>déjà édité</p>", css: "" },
    };
    const out = applyStarterTemplate({ data, operation: "create" } as never) as { builder: { html?: string } };
    expect(out.builder.html).toBe("<p>déjà édité</p>");
  });
});
