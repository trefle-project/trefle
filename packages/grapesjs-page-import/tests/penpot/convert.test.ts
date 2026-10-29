import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SANITIZE_CONFIG } from "@trefle/shared";
import grapesjs, { type Component } from "grapesjs";
import { describe, expect, it } from "vitest";

import { DEVICE_BREAKPOINTS } from "../../src/layout";
import {
  boardNeeds,
  convertBoard,
  IMAGE_PLACEHOLDER,
  MAX_PAGE_BYTES,
  type ConvertContext,
} from "../../src/penpot/convert";
import type { Shape } from "../../src/penpot/model";
import { readPenpotFile, type PenpotFile } from "../../src/penpot/read";
import { paragraphs, paragraphText } from "../../src/penpot/text";
import { board, penpotZip } from "./builders";
import { reportText } from "../../src/serialize";

/** 015-penpot-site-import T015 — contracts/penpot-conversion.md guarantees 1–7, 9, 11–14. */

const fixture = (name: string) =>
  readPenpotFile(new Uint8Array(readFileSync(join(__dirname, "../fixtures", name))));
const ctx = (over: Partial<ConvertContext> = {}): ConvertContext => ({
  paths: {},
  images: {},
  fonts: new Set(),
  fileName: "site.penpot",
  ...over,
});
const site = (f: PenpotFile) => f.pages.find((p) => p.name === "Site")!;

const blog = fixture("blog-mini.penpot");
const agence = fixture("agence-mini.penpot");
const convertAll = (f: PenpotFile, c: Partial<ConvertContext> = {}) =>
  site(f).boards.map((b) => ({ board: b, out: convertBoard(f, site(f).id, b.id, ctx(c)) }));

const parse = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;
/** Serialise with sorted attributes, so attribute order doesn't matter. */
const normal = (el: Element): string => {
  const attrs = [...el.attributes]
    .map((a) => `${a.name}="${a.value}"`)
    .sort()
    .join(" ");
  const kids = [...el.childNodes]
    .map((n) => (n.nodeType === 3 ? n.textContent : n.nodeType === 1 ? normal(n as Element) : ""))
    .join("");
  return `<${el.tagName.toLowerCase()} ${attrs}>${kids}</>`;
};

describe("guarantee 1 — allow-list", () => {
  const { ALLOWED_TAGS, ALLOWED_ATTR } = SANITIZE_CONFIG;
  const tags = new Set(ALLOWED_TAGS.map((t) => t.toLowerCase()));
  const attrs = new Set(ALLOWED_ATTR.map((a) => a.toLowerCase()));
  it.each([...convertAll(blog), ...convertAll(agence)].map((r) => [r.board.name, r.out.html]))(
    "%s",
    (_name, html) => {
      for (const el of Array.from(parse(html).querySelectorAll("*"))) {
        expect(tags.has(el.tagName.toLowerCase()), el.tagName).toBe(true);
        for (const a of Array.from(el.attributes)) {
          const ok =
            attrs.has(a.name.toLowerCase()) ||
            a.name.startsWith("aria-") ||
            a.name.startsWith("data-");
          expect(ok, `${el.tagName} ${a.name}`).toBe(true);
          expect(a.value).not.toMatch(/javascript:/i);
        }
      }
    },
  );
});

describe("guarantee 2 — verbatim texts", () => {
  it("every paragraph of every visible text shape appears exactly as stored", () => {
    const f = blog;
    const shapes = f.shapes(site(f).id);
    const { board: b, out } = convertAll(f)[0]!;
    const body = parse(out.html).textContent ?? "";
    const visibleTexts: string[] = [];
    const walk = (s: Shape | undefined) => {
      if (!s || s.hidden) return;
      if (s.type === "text")
        for (const p of paragraphs(s.content)) visibleTexts.push(paragraphText(p));
      (s.shapes ?? []).forEach((id) => walk(shapes.get(id)));
    };
    walk(shapes.get(b.id));
    expect(visibleTexts.length).toBeGreaterThan(30);
    for (const t of visibleTexts) expect(body).toContain(t);
  });
});

describe("guarantee 3 — order", () => {
  it("flex children are emitted reversed (Penpot stores last-shown first)", () => {
    const zip = penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("b", "Accueil", {
              layout: "flex",
              layoutFlexDir: "column",
              shapes: ["t3", "t2", "t1"],
            }),
            ...["t1", "t2", "t3"].map((id, i) => ({
              id,
              name: id,
              type: "text",
              parentId: "b",
              x: 0,
              y: i * 50,
              width: 100,
              height: 20,
              content: {
                type: "root",
                children: [
                  {
                    type: "paragraph-set",
                    children: [
                      {
                        type: "paragraph",
                        fontSize: "16",
                        children: [{ text: `T${i + 1}`, fontSize: "16" }],
                      },
                    ],
                  },
                ],
              },
            })),
          ],
        },
      ],
    });
    const f = readPenpotFile(zip);
    expect(parse(convertBoard(f, "p", "b", ctx()).html).textContent).toBe("T1T2T3");
  });
});

describe("guarantees 4 and 5 — round trip and editability", () => {
  it.each(convertAll(blog).map((r) => [r.board.name, r.out] as const))(
    "%s opens in GrapesJS and exports the same page",
    (_n, out) => {
      const editor = grapesjs.init({
        headless: true,
        storageManager: false,
        projectData: out.projectData,
      });
      try {
        const html = editor.getHtml().replace(/^<body[^>]*>|<\/body>$/g, "");
        expect(normal(parse(html))).toBe(normal(parse(out.html)));
        const css = editor.getCss() ?? "";
        expect(css).toContain(`@media ${DEVICE_BREAKPOINTS.tablet}`);
        expect(css).toContain(`@media ${DEVICE_BREAKPOINTS.mobilePortrait}`);
        const all: Component[] = [];
        const walk = (c: Component) => {
          all.push(c);
          c.components().forEach(walk);
        };
        walk(editor.getWrapper()!);
        // The wrapper (the page body) is never removable in GrapesJS; everything converted is.
        for (const c of all.filter((x) => x.get("type") !== "wrapper")) {
          expect(c.get("locked"), c.getId()).toBeFalsy();
          expect(c.get("removable")).not.toBe(false);
          expect(c.get("copyable")).not.toBe(false);
        }
        const texts = all.filter((c) => /^(p|h[1-6])$/.test(c.get("tagName") ?? ""));
        expect(texts.length).toBeGreaterThan(10);
        for (const t of texts) expect(t.get("type")).toBe("text");
      } finally {
        editor.destroy();
      }
    },
  );
});

describe("guarantee 6 — responsive only in device styles", () => {
  it("every media rule uses the editor's tablet or mobile-portrait breakpoint", () => {
    for (const { out } of [...convertAll(blog), ...convertAll(agence)]) {
      const allowed: string[] = [DEVICE_BREAKPOINTS.tablet, DEVICE_BREAKPOINTS.mobilePortrait];
      for (const r of out.projectData.styles)
        if (r.mediaText) expect(allowed).toContain(r.mediaText);
      expect(out.css.match(/@media [^{]+/g)?.every((m) => allowed.includes(m.slice(7)))).toBe(true);
    }
  });
});

describe("guarantee 7 — free layout", () => {
  const free = penpotZip({
    pages: [
      {
        id: "p",
        name: "Site",
        shapes: [
          board("b", "Wire", { shapes: ["r1"], fills: [{ fillColor: "#ffffff" }] }),
          {
            id: "r1",
            name: "Hero",
            type: "rect",
            parentId: "b",
            x: 144,
            y: 90,
            width: 720,
            height: 300,
            fills: [{ fillColor: "#bdbdbd" }],
          },
        ],
      },
    ],
  });
  it("children of a free board use cqw only, the board is reported with an action before publishing", () => {
    const out = convertBoard(readPenpotFile(free), "p", "b", ctx());
    const rule = out.projectData.styles.find((r) => r.style["background-color"] === "#bdbdbd")!;
    expect(rule.style).toMatchObject({
      position: "absolute",
      left: "10cqw",
      top: "6.25cqw",
      width: "50cqw",
      height: "20.833cqw",
    });
    expect(out.css).toContain("container-type:inline-size");
    expect(out.report.simplified.some((s) => reportText(s.what).includes("« Wire »"))).toBe(true);
    expect(out.report.actionsBeforePublish).toEqual([
      "Cette page ne se réorganise pas sur mobile : adaptez-la avant de la publier",
    ]);
  });
});

describe("guarantee 9 — headings", () => {
  it.each([...convertAll(blog), ...convertAll(agence)].map((r) => [r.board.name, r.out.html]))(
    "%s has exactly one h1",
    (_n, html) => {
      expect(parse(html).querySelectorAll("h1")).toHaveLength(1);
    },
  );
});

describe("guarantee 11 — images", () => {
  it("stored images are used with their alt; missing ones become the placeholder and are reported", () => {
    const f = agence;
    const needs = boardNeeds(
      f,
      site(f).id,
      site(f).boards.map((b) => b.id),
    );
    expect(needs.images.length).toBe(2);
    const [first, second] = needs.images;
    const images = {
      [first!.mediaId]: { url: "https://assets.example/a.webp", alt: "Plan", altPending: false },
      [second!.mediaId]: null,
    };
    const outs = convertAll(f, { images }).map((r) => r.out);
    const html = outs.map((o) => o.html).join("");
    const css = outs.map((o) => o.css).join("");
    expect(
      html.includes('src="https://assets.example/a.webp" alt="Plan"') ||
        css.includes("https://assets.example/a.webp"),
    ).toBe(true);
    expect(html.includes(IMAGE_PLACEHOLDER) || outs.some((o) => o.report.failedImages.length)).toBe(
      true,
    );
    expect(outs.flatMap((o) => o.report.failedImages).length).toBeGreaterThan(0);
    // The Pages hook `rejectInlineImages` refuses base64 images: none may reach the page.
    const all = outs.map((o) => o.html + o.css + JSON.stringify(o.projectData)).join("");
    expect(all).not.toMatch(/data:image\/[a-z0-9.+-]+;base64,/i);
  });
  it("needs list fonts with weights/styles and Google-ness", () => {
    const needs = boardNeeds(
      blog,
      site(blog).id,
      site(blog).boards.map((b) => b.id),
    );
    expect(needs.fonts).toContainEqual({
      family: "Montserrat",
      googleFamily: "Montserrat",
      weight: 900,
      style: "normal",
    });
    expect(needs.fonts.some((x) => x.family === "Outfit")).toBe(true);
  });
  it("needs list Penpot's default font as Google's Source Sans 3", () => {
    const run = { text: "Bonjour", fontId: "sourcesanspro", fontFamily: "sourcesanspro", fontWeight: "400", fontStyle: "normal" };
    const zip = penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("b", "Accueil", { shapes: ["t"] }),
            {
              id: "t",
              name: "t",
              type: "text",
              parentId: "b",
              x: 0,
              y: 0,
              width: 100,
              height: 20,
              content: { type: "root", children: [{ type: "paragraph-set", children: [{ type: "paragraph", children: [run] }] }] },
            },
          ],
        },
      ],
    });
    const f = readPenpotFile(zip);
    expect(boardNeeds(f, "p", ["b"]).fonts.some((x) => x.family === "Source Sans 3")).toBe(true);
  });
});

describe("guarantee 12 — hidden shapes", () => {
  it("a hidden shape and its subtree are absent", () => {
    const zip = penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("b", "Accueil", { layout: "flex", layoutFlexDir: "column", shapes: ["g"] }),
            {
              id: "g",
              name: "Hidden group",
              type: "frame",
              parentId: "b",
              hidden: true,
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              shapes: ["t"],
              layout: "flex",
            },
            {
              id: "t",
              name: "t",
              type: "text",
              parentId: "g",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              content: {
                type: "root",
                children: [
                  {
                    type: "paragraph-set",
                    children: [{ type: "paragraph", children: [{ text: "SECRET" }] }],
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(convertBoard(readPenpotFile(zip), "p", "b", ctx()).html).not.toContain("SECRET");
  });
});

describe("guarantees 13 and 14 — size and robustness", () => {
  it("bytes = projectData + html + css, reference boards far under the cap", () => {
    for (const { out } of [...convertAll(blog), ...convertAll(agence)]) {
      expect(out.bytes).toBe(
        new TextEncoder().encode(JSON.stringify(out.projectData) + out.html + out.css).length,
      );
      expect(out.bytes).toBeLessThan(MAX_PAGE_BYTES / 2);
    }
  });
  it("unknown shape types and malformed values are skipped, never thrown", () => {
    const zip = penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("b", "Accueil", {
              layout: "flex",
              layoutFlexDir: "column",
              shapes: ["u", "r", "x"],
              layoutGap: { rowGap: "lots" as never },
            }),
            {
              id: "u",
              name: "Strange",
              type: "hologram",
              parentId: "b",
              x: 0,
              y: 0,
              width: 1,
              height: 1,
            },
            {
              id: "r",
              name: "r",
              type: "rect",
              parentId: "b",
              x: 0,
              y: 0,
              width: Number.NaN,
              height: -5,
              fills: [{ fillColor: "javascript:x" }],
              r1: 1e12,
            },
            {
              id: "x",
              name: "dangling",
              type: "frame",
              parentId: "b",
              x: 0,
              y: 0,
              width: 10,
              height: 10,
              shapes: ["missing"],
            },
          ],
        },
      ],
    });
    const out = convertBoard(readPenpotFile(zip), "p", "b", ctx());
    expect(out.report.omitted).toContainEqual({ what: "Strange", reason: "other" });
    expect(out.html + out.css).not.toMatch(/javascript|NaN|Infinity/);
  });
});

describe("contrast of translucent colours", () => {
  it("reports an e-mail placeholder (rgba text on an rgba field) as low contrast", () => {
    // A newsletter field as real designs draw it: black at 30 % on a frame of black at 5 %, over white.
    const run = { text: "jamie@example.com", fontSize: "17", fontWeight: "500", fills: [{ fillColor: "#000000", fillOpacity: 0.3 }] };
    const zip = penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("b", "Accueil", { layout: "flex", layoutFlexDir: "column", fills: [{ fillColor: "#ffffff", fillOpacity: 1 }], shapes: ["field"] }),
            { id: "field", name: "email-subscription", type: "frame", parentId: "b", frameId: "b", x: 0, y: 0, width: 400, height: 48, fills: [{ fillColor: "#000000", fillOpacity: 0.05 }], shapes: ["ph"] },
            {
              id: "ph",
              name: "email field (placeholder)",
              type: "text",
              parentId: "field",
              frameId: "field",
              x: 12,
              y: 12,
              width: 156,
              height: 21,
              content: { type: "root", children: [{ type: "paragraph-set", children: [{ type: "paragraph", ...run, children: [run] }] }] },
            },
          ],
        },
      ],
    });
    const low = convertBoard(readPenpotFile(zip), "p", "b", ctx()).report.accessibility.filter((a) => a.kind === "low-contrast");
    expect(low).toContainEqual({ kind: "low-contrast", where: "email field (placeholder)", detail: "2.10:1 (minimum 4.5:1)" });
  });
});

describe("carousels (reported, never converted)", () => {
  const dot = (id: string, x: number, fill: string, plain: boolean) => ({
    id,
    name: plain ? "icon" : fill === "#111111" ? "dot-full" : "dot-empty",
    type: "circle" as const,
    parentId: "dots",
    x,
    y: 500,
    width: 12,
    height: 12,
    fills: [{ fillColor: fill }],
  });
  const zip = (dotsName: string, plain = false) =>
    penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("b", "Accueil", { layout: "flex", layoutFlexDir: "column", shapes: ["sec"] }),
            {
              id: "sec",
              name: "Content Sections / Témoignages",
              type: "frame",
              parentId: "b",
              x: 0,
              y: 0,
              width: 1440,
              height: 600,
              layout: "flex",
              layoutFlexDir: "column",
              shapes: ["dots", "card"],
            },
            { id: "card", name: "Review card", type: "rect", parentId: "sec", x: 100, y: 100, width: 400, height: 300, fills: [{ fillColor: "#eeeeee" }] },
            {
              id: "dots",
              name: dotsName,
              type: "frame",
              parentId: "sec",
              x: 100,
              y: 500,
              width: 60,
              height: 12,
              layout: "flex",
              layoutFlexDir: "row",
              shapes: ["d3", "d2", "d1"],
            },
            dot("d1", 100, "#111111", plain),
            dot("d2", 124, "#cccccc", plain),
            dot("d3", 148, "#cccccc", plain),
          ],
        },
      ],
    });
  const simplified = (name: string, plain = false) =>
    convertBoard(readPenpotFile(zip(name, plain)), "p", "b", ctx()).report.simplified;

  it("a row of pagination dots names its section in « Simplifié »", () => {
    expect(simplified("Dots")).toContainEqual({
      what: "Carrousel « Témoignages »",
      how: "reproduit tel que dessiné : seule la diapositive visible, sans défilement (Trefle n'a pas de bloc carrousel)",
    });
  });
  it("small items in a row are not a carousel without a dots-like name", () => {
    expect(simplified("Icons", true).some((s) => reportText(s.what).startsWith("Carrousel"))).toBe(false);
    // The dots' own names are enough.
    expect(simplified("Icons").some((s) => reportText(s.what).startsWith("Carrousel"))).toBe(true);
  });
});

describe("fidelity fixes from the reference evaluation (T048)", () => {
  const para = (t: string) => ({ type: "paragraph", fontSize: "16", children: [{ text: t, fontSize: "16" }] });
  const textShape = (id: string, parentId: string, lines: string[], over: Partial<Shape> = {}): Partial<Shape> => ({
    id,
    name: id,
    type: "text",
    parentId,
    x: 0,
    y: 0,
    width: 84,
    height: 22,
    content: { type: "root", children: [{ type: "paragraph-set", children: lines.map(para) }] },
    ...over,
  });
  const convert = (shapes: Partial<Shape>[]) =>
    convertBoard(
      readPenpotFile(penpotZip({ pages: [{ id: "p", name: "Site", shapes: [board("b", "Accueil", { layout: "flex", layoutFlexDir: "column", shapes: shapes.filter((s) => s.parentId === "b").map((s) => s.id!) }), ...shapes] }] })),
      "p",
      "b",
      ctx(),
    );
  const ruleFor = (out: ReturnType<typeof convert>, text: string) => {
    const id = new RegExp(`<(?:p|h[1-6]) id="([^"]+)"[^>]*>${text}`).exec(out.html)![1];
    return {
      base: out.projectData.styles.find((r) => r.selectors.includes(`#${id}`) && !r.mediaText)?.style ?? {},
      mobile: out.projectData.styles.find((r) => r.selectors.includes(`#${id}`) && r.mediaText?.includes("max-width: 479"))?.style,
    };
  };

  it("an « auto width » label in a row takes its natural width and isn't squeezed (except on mobile)", () => {
    const out = convert([
      { id: "nav", name: "Nav", type: "frame", parentId: "b", x: 0, y: 0, width: 400, height: 22, layout: "flex", layoutFlexDir: "row", shapes: ["t"] },
      textShape("t", "nav", ["About Us"], { growType: "auto-width" }),
    ]);
    const r = ruleFor(out, "About Us");
    expect(r.base).toMatchObject({ "max-width": "100%", "flex-shrink": "0" });
    expect(r.base.width).toBeUndefined();
    expect(r.base["white-space"]).toBeUndefined();
    expect(JSON.stringify(out.projectData.styles)).toContain('"flex-shrink":"1"');
  });

  it("a blank line between paragraphs keeps its height", () => {
    const out = convert([textShape("t", "b", ["First paragraph", "", "Second paragraph"], { width: 600, height: 60 })]);
    expect(out.html).toMatch(/<p[^>]*>First paragraph<\/p><p[^>]*><br><\/p><p[^>]*>Second paragraph<\/p>/);
  });

  it("an image wider than its frame keeps its full height (Penpot crops it, it doesn't shrink it)", () => {
    const out = convert([
      { id: "fig", name: "feature-image", type: "frame", parentId: "b", x: 0, y: 0, width: 720, height: 662, layout: "flex", layoutFlexDir: "column", shapes: ["img"] },
      { id: "img", name: "photo", type: "rect", parentId: "fig", x: 0, y: 0, width: 1120, height: 630, fills: [{ fillColor: "#cccccc" }] },
    ]);
    expect(JSON.stringify(out.projectData.styles)).toContain('"aspect-ratio":"720 / 630"');
  });
});
