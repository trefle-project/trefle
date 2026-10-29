import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { ImportIR } from "../src/ir";
import { WireIR, fromWire, parseCss, repairWire } from "../src/ir-wire";

/**
 * 012-url-page-import — the model's wire format (one CSS-like string per
 * element) converts into the structured Import IR the serializer consumes.
 */
const fixture = (name: string) =>
  // Tests run from the package directory (npm --workspace, vitest).
  JSON.parse(readFileSync(resolve(process.cwd(), "../../apps/cms/tests/fixtures", name), "utf8"));

describe("fromWire", () => {
  it("turns the e2e fixture's wire output into exactly the structured fixture IR", () => {
    const wire = WireIR.parse(fixture("import-wire.fixture.json"));
    const ir = fromWire(wire);
    expect(ImportIR.parse(ir)).toEqual(ImportIR.parse(fixture("import-ir.fixture.json")));
  });

  it("maps every allowed property and drops what isn't allowed or valid", () => {
    const ir = fromWire({
      sourceHadMobileLayout: true,
      simplified: [],
      omitted: [],
      sections: [
        {
          source: "S",
          css: "background:#FFF; background-image:url('i7'); padding:10px 20px; border-radius:8; position:fixed; color:red; @tablet{padding:5px} @desktop{padding:1px}",
          rows: [
            {
              kind: "columns",
              css: "gap:32px; @mobile{display:none}",
              columns: [
                {
                  css: "background-color:#abcdef",
                  blocks: [
                    {
                      kind: "call-to-action",
                      label: "t1",
                      href: "t1",
                      buttonCss: "background-color:#123; color:#fff !important",
                    },
                    {
                      kind: "rich-text",
                      parts: [{ ref: "t2", as: "p", css: "font-weight:bold; font-style:italic; font-size:18.4px; @mobile{font-size:16px; display:none}" }],
                    },
                  ],
                },
                { css: "background-image:i8; padding-top:160px", blocks: [{ kind: "image", image: "i1", css: "width:300px; background-image:i9" }] },
              ],
            },
          ],
        },
      ],
    });
    const s = ir.sections[0]!;
    expect(s.style).toEqual({
      backgroundColor: "#ffffff",
      backgroundImage: "i7",
      paddingTop: 10,
      paddingRight: 20,
      paddingBottom: 10,
      paddingLeft: 20,
      borderRadius: 8,
    });
    expect(s.devices).toEqual({ tablet: { box: { paddingTop: 5, paddingRight: 5, paddingBottom: 5, paddingLeft: 5 } } });
    const row = s.rows[0]!;
    expect(row).toMatchObject({ kind: "columns", gap: 32, devices: { mobile: { hidden: true } } });
    if (row.kind !== "columns") throw new Error("columns expected");
    expect(row.columns[0]!.style).toEqual({ backgroundColor: "#abcdef" });
    expect(row.columns[1]!.style).toEqual({ backgroundImage: "i8", paddingTop: 160 });
    expect(row.columns[0]!.blocks[0]).toEqual({ kind: "call-to-action", label: "t1", href: "t1", buttonColor: "#112233", labelColor: "#ffffff" });
    expect(row.columns[0]!.blocks[1]).toEqual({
      kind: "rich-text",
      parts: [{ ref: "t2", as: "p", style: { fontWeight: 700, fontStyle: "italic", fontSize: 18 }, devices: { mobile: { text: { fontSize: 16 }, hidden: true } } }],
    });
    // background-image only on sections and columns; width is the image's max width.
    expect(row.columns[1]!.blocks[0]).toEqual({ kind: "image", image: "i1", maxWidth: 300 });
  });

  it("lifts a banner photo put on the hero to its section (only sections carry background images)", () => {
    const wire = (sectionCss?: string) =>
      fromWire({
        sourceHadMobileLayout: true,
        simplified: [],
        omitted: [],
        sections: [
          {
            source: "Bandeau",
            css: sectionCss,
            rows: [{ kind: "blocks", blocks: [{ kind: "hero", heading: "t1", headingLevel: 1, css: "background-image:url(i2); padding:120px 24px" }] }],
          },
        ],
      }).sections[0]!;
    const s = wire();
    expect(s.style).toEqual({ backgroundImage: "i2" });
    expect((s.rows[0] as { blocks: { style?: unknown }[] }).blocks[0]!.style).toEqual({ paddingTop: 120, paddingRight: 24, paddingBottom: 120, paddingLeft: 24 });
    // The section's own image wins.
    expect(wire("background-image:i5").style).toEqual({ backgroundImage: "i5" });
  });

  it("an element without css gets no style at all", () => {
    const ir = fromWire({ sourceHadMobileLayout: false, simplified: [], omitted: [], sections: [{ source: "S", rows: [{ kind: "blocks", blocks: [{ kind: "testimonial", quote: "t1" }] }] }] });
    expect(ir.sections[0]).toEqual({ source: "S", rows: [{ kind: "blocks", blocks: [{ kind: "testimonial", quote: "t1" }] }] });
  });
});

describe("repairWire", () => {
  it("maps out-of-list values to the nearest allowed one and drops unknown blocks, reporting them", () => {
    const raw = {
      sourceHadMobileLayout: true,
      simplified: [],
      omitted: [{ what: "Menu", reason: "menu" }],
      sections: [
        {
          source: "S",
          rows: [
            {
              kind: "blocks",
              blocks: [
                { kind: "hero", heading: "t1", headingLevel: 3 },
                { kind: "rich-text", parts: [{ ref: "t2", as: "h5" }, { ref: "t3", as: "li" }, { ref: "t4", as: "span" }] },
                { kind: "carousel", items: ["i1"] },
              ],
            },
            { kind: "columns", columns: [{ blocks: [{ kind: "pricing-table" }, { kind: "image", image: "i2" }] }] },
            { kind: "grid", cells: [] },
          ],
        },
      ],
    };
    const wire = WireIR.parse(repairWire(raw));
    const blocks = (wire.sections[0]!.rows[0] as { blocks: unknown[] }).blocks;
    expect(blocks).toEqual([
      { kind: "hero", heading: "t1", headingLevel: 2 },
      { kind: "rich-text", parts: [{ ref: "t2", as: "h4" }, { ref: "t3", as: "li-ul" }, { ref: "t4", as: "p" }] },
    ]);
    expect(wire.sections[0]!.rows).toHaveLength(2);
    expect(wire.omitted).toEqual([
      { what: "Menu", reason: "other" },
      { what: "Bloc « carousel » non reconnu", reason: "other" },
      { what: "Bloc « pricing-table » non reconnu", reason: "other" },
    ]);
  });

  it("leaves a valid answer unchanged and a broken one for validation to refuse", () => {
    const valid = fixture("import-wire.fixture.json");
    expect(repairWire(structuredClone(valid))).toEqual(valid);
    expect(WireIR.safeParse(repairWire({ sections: "x" })).success).toBe(false);
  });
});

describe("parseCss", () => {
  it("splits base declarations and device blocks, lower-casing names", () => {
    expect(parseCss("Color:#000; @mobile{ Font-Size: 14px } padding:4px;@tablet{color:#111}")).toEqual({
      base: { color: "#000", padding: "4px" },
      tablet: { color: "#111" },
      mobile: { "font-size": "14px" },
    });
    expect(parseCss(undefined)).toEqual({ base: {}, tablet: {}, mobile: {} });
    expect(parseCss("nonsense; :x; y:")).toEqual({ base: {}, tablet: {}, mobile: {} });
  });
});

describe("wire schema size", () => {
  it("keeps few optional properties: the API refuses output grammars that are too large", () => {
    // The structured IR (40+ optional style fields nested per device) was
    // refused with 400 "compiled grammar is too large"; the wire format has
    // 17 and compiles (checked against the API on 2026-09-28).
    const schema = z.toJSONSchema(WireIR, { reused: "ref" }) as Record<string, unknown>;
    let optional = 0;
    const walk = (node: unknown) => {
      if (!node || typeof node !== "object") return;
      const o = node as { properties?: Record<string, unknown>; required?: string[] };
      if (o.properties) optional += Object.keys(o.properties).filter((k) => !(o.required ?? []).includes(k)).length;
      Object.values(o).forEach(walk);
    };
    walk(schema);
    expect(optional).toBeLessThanOrEqual(17);
  });
});
