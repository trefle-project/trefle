import { describe, expect, it } from "vitest";

import type { Shape, TextNode } from "../../src/penpot/model";
import { PX } from "../../src/penpot/style";
import {
  assignHeadings,
  buildParagraph,
  genericFamily,
  headingLevelFromName,
  textStyleCss,
  type FontContext,
} from "../../src/penpot/text";

/** 015-penpot-site-import T013 — research P7. */

const fonts = (available: string[] = []): FontContext => ({
  available: new Set(available),
  substituted: new Set(),
});
const leaf = (text: string, over: Partial<TextNode> = {}): TextNode => ({
  text,
  fontFamily: "Inter Tight",
  fontId: "gfont-inter-tight",
  fontSize: "16",
  fontWeight: "400",
  fills: [{ fillColor: "#15171a", fillOpacity: 1 }],
  ...over,
});
const para = (children: TextNode[], over: Partial<TextNode> = {}): TextNode => ({
  type: "paragraph",
  fontFamily: "Inter Tight",
  fontId: "gfont-inter-tight",
  fontSize: "16",
  fontWeight: "400",
  fills: [{ fillColor: "#15171a", fillOpacity: 1 }],
  children,
  ...over,
});
const textShape = (id: string, size: number, text = id, typographyRefId?: string): Shape => ({
  id,
  name: id,
  type: "text",
  content: {
    type: "root",
    children: [
      {
        type: "paragraph-set",
        children: [
          para([leaf(text, { fontSize: String(size), typographyRefId })], {
            fontSize: String(size),
            typographyRefId,
          }),
        ],
      },
    ],
  },
});

describe("paragraphs", () => {
  it("verbatim, escaped text; spans only for runs that differ", () => {
    const p = buildParagraph(
      para([leaf("A <b> & "), leaf("bold", { fontWeight: "700" }), leaf(' "q"')], {
        textAlign: "center",
      }),
      PX,
      fonts(["Inter Tight"]),
    );
    expect(p.text).toBe('A <b> & bold "q"');
    expect(p.html).toBe(
      'A &lt;b&gt; &amp; <span style="font-weight:700">bold</span> &quot;q&quot;',
    );
    expect(p.style).toMatchObject({
      "font-family": '"Inter Tight", sans-serif',
      "font-size": "16px",
      "font-weight": "400",
      color: "#15171a",
      "text-align": "center",
    });
  });
  it("line height, letter spacing, transform, decoration, italic", () => {
    const s = textStyleCss(
      {
        lineHeight: "1.4",
        letterSpacing: "0.12",
        textTransform: "uppercase",
        textDecoration: "underline",
        fontStyle: "italic",
      },
      PX,
      fonts(),
    );
    expect(s).toEqual({
      "line-height": "1.4",
      "letter-spacing": "0.12px",
      "text-transform": "uppercase",
      "text-decoration": "underline",
      "font-style": "italic",
    });
  });
  it("fonts not available on the domain fall back to a generic stack and are reported", () => {
    const f = fonts();
    expect(
      textStyleCss({ fontFamily: "EB Garamond", fontId: "gfont-eb-garamond" }, PX, f)[
        "font-family"
      ],
    ).toBe("serif");
    expect(
      textStyleCss({ fontFamily: "sourcesanspro", fontId: "sourcesanspro" }, PX, f)["font-family"],
    ).toBe("sans-serif");
    expect([...f.substituted].sort()).toEqual(["EB Garamond", "Source Sans 3"]);
    expect(genericFamily("JetBrains Mono")).toBe("monospace");
    expect(genericFamily("Noto Serif")).toBe("serif");
    expect(genericFamily("PT Sans")).toBe("sans-serif");
  });
});

describe("headings", () => {
  it("names: H1, H2 Heading, Titre 3, Heading 4", () => {
    expect(
      ["H1", "H2 Heading", "Titre 3", "Heading 4", "Body text", "Menu Item", "h12"].map(
        headingLevelFromName,
      ),
    ).toEqual([1, 2, 3, 4, undefined, undefined, undefined]);
  });
  it("by size: largest → one h1, others of that size h2, next sizes ≥ 24 px h2/h3", () => {
    const t = [
      textShape("a", 46),
      textShape("b", 34),
      textShape("c", 46),
      textShape("d", 24),
      textShape("e", 16),
    ];
    const tags = assignHeadings(t, new Map());
    expect(Object.fromEntries(tags)).toEqual({ a: "h1", b: "h2", c: "h2", d: "h3" });
  });
  it("typography names win, and there is exactly one h1", () => {
    const typos = new Map([
      ["t1", { id: "t1", name: "H1 Heading" }],
      ["t2", { id: "t2", name: "H2 Heading" }],
    ]);
    const t = [
      textShape("a", 20, "a", "t2"),
      textShape("b", 30, "b", "t1"),
      textShape("c", 30, "c", "t1"),
      textShape("d", 50),
    ];
    const tags = assignHeadings(t, typos);
    expect(tags.get("b")).toBe("h1");
    expect(tags.get("c")).toBe("h2");
    expect([...tags.values()].filter((v) => v === "h1")).toHaveLength(1);
  });
  it("no heading at all → the first largest text still becomes h1", () => {
    const tags = assignHeadings(
      [textShape("a", 14), textShape("b", 16), textShape("c", 16)],
      new Map(),
    );
    expect(tags.get("b")).toBe("h1");
  });
});
