import { describe, expect, it } from "vitest";

import type { ImportIR as IRType } from "../src/ir";
import { prominentForm, reportInFrench, serializeImport, type ExtractForm, type PageExtract, type SerializeOptions } from "../src/serialize";
import { BLOCKS, EXTRACT, IR } from "./fixtures";

/**
 * 012-url-page-import (T063, User Story 4, contracts/import-ir.md "Lead
 * form") — the source form becomes the library's lead-form block on a
 * subscription page, and only there.
 */
const box = { x: 0, y: 0, width: 400, height: 200 };
const form = (id: string, types: string[]): ExtractForm => ({
  id,
  box,
  fields: types.map((type, i) => ({ label: `${type} ${i}`, type, required: false })),
});
const EXTRACT_3_FORMS: PageExtract = {
  ...EXTRACT,
  forms: [form("f1", ["text", "tel"]), form("f2", ["text", "email"]), form("f3", ["email"])],
};
/** IR with lead-form leaves for f1, f2, f3 (in that order), at the top level. */
const IR_3_FORMS: IRType = {
  ...IR,
  sections: [
    ...IR.sections.map((s) => ({
      ...s,
      rows: s.rows.map((r) =>
        r.kind === "columns" ? { ...r, columns: r.columns.filter((c) => !c.blocks.some((b) => b.kind === "lead-form")) } : r,
      ),
    })),
    {
      source: "Formulaires",
      rows: [{ kind: "blocks", blocks: ["f1", "f2", "f3"].map((f) => ({ kind: "lead-form" as const, form: f })) }],
    },
  ],
};

const OPTS: SerializeOptions = { pageType: "subscription", blocks: BLOCKS };
// Report lines read as their French text (023: Trefle's lines are keyed).
const run = (ir: IRType = IR, extract: PageExtract = EXTRACT, opts: Partial<SerializeOptions> = {}) => {
  const out = serializeImport(ir, extract, { ...OPTS, ...opts });
  return { ...out, report: reportInFrench(out.report) };
};

type Component = { tagName?: string; attributes?: Record<string, string>; components?: Component[] | string; [k: string]: unknown };
function findAll(c: Component, pred: (c: Component) => boolean, out: Component[] = []): Component[] {
  if (pred(c)) out.push(c);
  if (Array.isArray(c.components)) c.components.forEach((x) => findAll(x, pred, out));
  return out;
}
const leadForms = (out: ReturnType<typeof run>) =>
  findAll(out.projectData.pages[0]!.frames[0]!.component as Component, (c) => c.attributes?.["data-block"] === "lead-form");

describe("subscription page", () => {
  it("places exactly one lead-form block, identical to the library's, where the source form was (inside its column)", () => {
    const out = run();
    const def = BLOCKS.find((b) => b.id === "lead-form")!.content as {
      tagName: string;
      attributes: Record<string, string>;
      style: Record<string, string>;
      droppable: boolean;
      editable: boolean;
    };
    const found = leadForms(out);
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      tagName: def.tagName,
      attributes: def.attributes,
      droppable: def.droppable,
      editable: def.editable,
      components: [],
    });
    // Its style is the block's own, as the `#form` rule GrapesJS keeps for it.
    expect(out.projectData.styles.find((r) => r.selectors.includes("#form"))?.style).toEqual(def.style);
    // Sits in the fourth column, as in the source.
    const doc = new DOMParser().parseFromString(out.html, "text/html");
    expect(doc.querySelectorAll('[data-block="lead-form"]')).toHaveLength(1);
    expect(doc.querySelector('[data-block="column"] > [data-block="lead-form"]#form')).not.toBeNull();
    expect(out.leadForm).toBe("f1");
    expect(out.report.reproduced.blocks["lead-form"]).toBe(1);
    expect(out.report.actionsBeforePublish.some((a) => a.startsWith("Ajouter un bloc Formulaire"))).toBe(false);
  });

  it("with several forms keeps the first one with an email field; the others are reported as extra forms", () => {
    const out = run(IR_3_FORMS, EXTRACT_3_FORMS);
    expect(leadForms(out)).toHaveLength(1);
    expect(out.leadForm).toBe("f2");
    const extra = out.report.omitted.filter((o) => o.reason === "extra-form");
    expect(extra.map((o) => o.what)).toEqual([
      "Formulaire supplémentaire de la page source (text 0, tel 1)",
      "Formulaire supplémentaire de la page source (email 0)",
    ]);
  });

  it("without an email field anywhere, keeps the first form", () => {
    const extract = { ...EXTRACT_3_FORMS, forms: [form("f1", ["text"]), form("f2", ["tel"])] };
    expect(run(IR_3_FORMS, extract).leadForm).toBe("f1");
  });

  it("a source form the conversion did not place is reported, and the editor is asked to add the block", () => {
    const ir: IRType = { ...IR_3_FORMS, sections: IR_3_FORMS.sections.slice(0, -1) };
    const out = run(ir, EXTRACT_3_FORMS);
    expect(leadForms(out)).toHaveLength(0);
    expect(out.leadForm).toBeNull();
    expect(out.report.omitted.filter((o) => o.reason === "extra-form")).toHaveLength(3);
    expect(out.report.actionsBeforePublish).toContain("Ajouter un bloc Formulaire à l'endroit voulu et configurer ses champs");
  });

  it("a lead-form leaf pointing at an unknown form places nothing", () => {
    const ir: IRType = { ...IR, sections: [{ source: "x", rows: [{ kind: "blocks", blocks: [{ kind: "lead-form", form: "f99" }] }] }] };
    const out = run(ir);
    expect(leadForms(out)).toHaveLength(0);
    expect(out.leadForm).toBeNull();
  });

  it("a page whose source has no form reminds the editor to add a lead-form block", () => {
    const out = run(IR, { ...EXTRACT, forms: [] });
    expect(out.report.actionsBeforePublish).toContain("Ajouter un bloc Formulaire à l'endroit voulu et configurer ses champs");
  });
});

describe.each([
  ["free", "une page libre"],
  ["confirmation", "une page de confirmation"],
] as const)("%s page", (pageType, kind) => {
  it("places no lead-form block, reports every source form with the reason, asks for none", () => {
    const out = run(IR_3_FORMS, EXTRACT_3_FORMS, { pageType });
    expect(leadForms(out)).toHaveLength(0);
    expect(out.html).not.toContain("lead-form");
    expect(out.leadForm).toBeNull();
    const omitted = out.report.omitted.filter((o) => o.what.startsWith("Formulaire de la page source"));
    expect(omitted).toHaveLength(3);
    for (const o of omitted) expect(o.what).toContain(`${kind} ne peut pas porter de formulaire`);
    expect(out.report.actionsBeforePublish.some((a) => a.includes("Formulaire"))).toBe(false);
  });
});

describe("prominentForm", () => {
  it("is the first form with an email field, otherwise the first form", () => {
    expect(prominentForm(EXTRACT_3_FORMS.forms)?.id).toBe("f2");
    expect(prominentForm([form("a", ["text"]), form("b", ["tel"])])?.id).toBe("a");
    expect(prominentForm([])).toBeUndefined();
  });
});
