import { SANITIZE_CONFIG } from "@trefle/shared";
import { describe, expect, it } from "vitest";

import type { IRLeaf, ImportIR as IRType } from "../src/ir";
import { DEVICE_BREAKPOINTS } from "../src/layout";
import { isSafeInlineHtml, placedImageRefs, reportInFrench, serializeImport as serializeKeyed, type SerializeOptions } from "../src/serialize";
import { BLOCKS, EXTRACT, IR } from "./fixtures";

/**
 * 012-url-page-import (T024, contracts/import-ir.md "Serializer guarantees").
 */
const OPTS: SerializeOptions = { pageType: "subscription", blocks: BLOCKS };
// Report lines read as their French text (023: Trefle's lines are keyed).
const serializeImport = (...args: Parameters<typeof serializeKeyed>) => {
  const out = serializeKeyed(...args);
  return { ...out, report: reportInFrench(out.report) };
};
const run = (ir: IRType = IR, opts: Partial<SerializeOptions> = {}) => serializeImport(ir, EXTRACT, { ...OPTS, ...opts });

const parse = (html: string) => {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return doc.body;
};

const { ALLOWED_TAGS, ALLOWED_ATTR, ALLOWED_URI_REGEXP: SAFE_URI_REGEXP } = SANITIZE_CONFIG;

/** Every element and attribute in `html` is on the renderer's allow-list —
 * the single config publication and the « Code » view use (014, FR-015). */
function assertAllowListed(html: string) {
  for (const el of Array.from(parse(html).querySelectorAll("*"))) {
    expect(ALLOWED_TAGS, `tag <${el.tagName.toLowerCase()}>`).toContain(el.tagName.toLowerCase());
    for (const attr of Array.from(el.attributes)) {
      const ok = ALLOWED_ATTR.includes(attr.name) || attr.name.startsWith("data-");
      expect(ok, `attribute ${attr.name} on <${el.tagName.toLowerCase()}>`).toBe(true);
      if (attr.name === "href" || attr.name === "src") expect(SAFE_URI_REGEXP.test(attr.value), attr.value).toBe(true);
    }
  }
}

/** Seeded generator of arbitrary (partly invalid) IRs over the fixture's refs. */
function randomIR(seed: number): IRType {
  let s = seed;
  const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const refs = [...EXTRACT.texts.map((t) => t.id), "t999"];
  const colors = ["#112233", "#FFF", "red", "#12345z", "#abcdef"];
  const nums = [0, 12, 48, 401, -5, 3.5, 96];
  const box = () => ({ backgroundColor: pick(colors), paddingTop: pick(nums), borderRadius: pick(nums), textAlign: pick(["left", "center", "right"] as const) });
  const txt = () => ({ color: pick(colors), fontSize: pick(nums), fontWeight: pick([400, 700] as const) });
  const devices = () => ({ tablet: { box: box(), text: txt(), hidden: rnd() > 0.8 }, mobile: { text: txt(), hidden: rnd() > 0.7 } });
  const leaf = (): IRLeaf =>
    pick([
      () => ({ kind: "hero" as const, heading: pick(refs), headingLevel: 1 as const, text: [pick(refs)], cta: { label: pick(refs), href: pick(refs) }, style: box(), headingStyle: txt(), devices: devices() }),
      () => ({ kind: "rich-text" as const, parts: [{ ref: pick(refs), as: pick(["h2", "p", "li-ul", "li-ol", "blockquote"] as const), style: txt(), devices: devices() }] }),
      () => ({ kind: "image" as const, image: pick(["i1", "i2", "i9"]), maxWidth: pick(nums), caption: pick(refs) }),
      () => ({ kind: "call-to-action" as const, label: pick(refs), href: pick(refs), buttonColor: pick(colors), labelColor: pick(colors) }),
      () => ({ kind: "testimonial" as const, quote: pick(refs), author: pick(refs), textStyle: txt() }),
      () => ({ kind: "lead-form" as const, form: "f1" }),
    ])();
  return {
    sourceHadMobileLayout: rnd() > 0.5,
    simplified: [],
    omitted: [],
    sections: Array.from({ length: 1 + Math.floor(rnd() * 3) }, (_, i) => ({
      source: `S${i}`,
      style: box(),
      contentMaxWidth: pick([900, 50, 5000]),
      devices: devices(),
      rows: [
        { kind: "blocks" as const, blocks: [leaf(), leaf()] },
        { kind: "columns" as const, gap: pick(nums), columns: Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ blocks: [leaf()], style: box(), devices: devices() })) },
      ],
    })),
  };
}

describe("allow-listed output (FR-008)", () => {
  it("the fixture IR serializes to allow-listed markup only", () => {
    assertAllowListed(run().html);
  });

  it("holds for 200 generated IRs, including invalid refs and style values", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const ir = randomIR(seed);
      const out = run(ir);
      assertAllowListed(out.html);
      for (const rule of out.projectData.styles) {
        for (const v of Object.values(rule.style)) expect(v).not.toMatch(/[;{}<>]|expression|javascript/i);
      }
    }
  });
});

describe("verbatim texts", () => {
  it("every output text is byte-identical to an extract text", () => {
    const out = run();
    const extractHtml = new Map(EXTRACT.texts.map((t) => [t.id, t.html]));
    const texts = out.html.match(/<(h[1-4]|p|li|figcaption|a)\b[^>]*>([\s\S]*?)<\/\1>/g) ?? [];
    expect(texts.length).toBeGreaterThan(5);
    for (const ref of out.textsUsed) expect(out.html).toContain(extractHtml.get(ref)!);
    expect(out.html).toContain("Cultivez votre <b>potager</b> &amp; plus");
    expect(out.html).toContain('Un suivi <a href="https://exemple.fr/suivi">personnalisé</a>.');
  });

  it("drops a text whose markup is not the extract's safe inline markup, and reports it", () => {
    const ir: IRType = { ...IR, sections: [{ source: "X", rows: [{ kind: "blocks", blocks: [{ kind: "rich-text", parts: [{ ref: "t12", as: "p" }, { ref: "t5", as: "p" }] }] }] }] };
    const out = run(ir);
    expect(out.html).not.toContain("script");
    expect(out.report.omitted.some((o) => o.what.includes("t12"))).toBe(true);
  });

  it("isSafeInlineHtml accepts the canonical inline markup only", () => {
    expect(isSafeInlineHtml('A <b>b</b> <a href="https://x.fr/?a=1&amp;b=2">c</a><br/>&amp;')).toBe(true);
    expect(isSafeInlineHtml("<script>x</script>")).toBe(false);
    expect(isSafeInlineHtml('<a href="javascript:alert(1)">x</a>')).toBe(false);
    expect(isSafeInlineHtml('<b onclick="x">y</b>')).toBe(false);
    expect(isSafeInlineHtml("a & b")).toBe(false);
  });
});

describe("unknown refs and invalid values", () => {
  it("drops an element with an unknown ref and reports it, never crashes", () => {
    const ir: IRType = { ...IR, sections: [{ source: "X", rows: [{ kind: "blocks", blocks: [{ kind: "hero", heading: "t404", headingLevel: 1 }, { kind: "rich-text", parts: [{ ref: "t5", as: "p" }] }] }] }] };
    const out = run(ir);
    expect(out.html).not.toContain('data-block="hero"');
    expect(out.html).toContain("Des graines bio.");
    expect(out.report.omitted.find((o) => o.what.includes("t404"))?.reason).toBe("other");
  });

  it("drops a call-to-action whose target is not a safe link", () => {
    const ir: IRType = { ...IR, sections: [{ source: "X", rows: [{ kind: "blocks", blocks: [{ kind: "call-to-action", label: "t13", href: "t13" }, { kind: "rich-text", parts: [{ ref: "t5", as: "p" }] }] }] }] };
    const out = run(ir);
    expect(out.html).not.toContain("javascript");
    expect(out.html).not.toContain('data-block="call-to-action"');
  });

  it("drops invalid colours and out-of-range pixel values, keeps valid ones", () => {
    const ir: IRType = {
      ...IR,
      sections: [
        {
          source: "X",
          style: { backgroundColor: "red", paddingTop: 401, paddingBottom: 24 },
          rows: [{ kind: "blocks", blocks: [{ kind: "rich-text", parts: [{ ref: "t5", as: "p", style: { color: "#12345z", fontSize: 200 } }, { ref: "t4", as: "h2", style: { color: "#ABCDEF", fontSize: 30 } }] }] }],
        },
      ],
    };
    const { css } = run(ir);
    expect(css).not.toMatch(/red|401px|#12345z|200px/);
    expect(css).toContain("padding-bottom:24px");
    expect(css).toContain("color:#abcdef;font-size:30px");
  });
});

describe("layout", () => {
  it("splits more than four columns into rows of at most four (FR-023)", () => {
    const col = { blocks: [{ kind: "rich-text" as const, parts: [{ ref: "t5", as: "p" as const }] }] };
    const ir: IRType = { ...IR, sections: [{ source: "X", rows: [{ kind: "columns", columns: Array.from({ length: 6 }, () => col) }] }] };
    const out = run(ir);
    expect(out.html.match(/data-block="columns"/g)).toHaveLength(2);
    expect(out.html).toContain('data-cols="4"');
    expect(out.html).toContain('data-cols="2"');
    expect(out.report.reproduced.columns).toBe(2);
  });

  it("builds Section › inner › Columns › Column with the layout markers", () => {
    const body = parse(run().html);
    const section = body.querySelector('section[data-block="section"]')!;
    expect(section.firstElementChild!.hasAttribute("data-block-inner")).toBe(true);
    expect(section.querySelector('[data-block="columns"] > [data-block="column"] [data-block="hero"] h1')).not.toBeNull();
  });
});

describe("images", () => {
  it("uses the Image block's placeholder without Media and asks to replace it", () => {
    const out = run();
    const placeholder = /src="(data:image\/svg\+xml[^"]*)"/.exec(String(BLOCKS.find((b) => b.id === "image")!.content))![1]!;
    expect(out.html).toContain(`src="${placeholder}"`);
    expect(out.report.reproduced.images).toBe(2);
    expect(out.report.actionsBeforePublish).toContain("Remplacer les 2 images provisoires par des images de la médiathèque");
    // No Media for the section background → dropped, colour kept.
    expect(out.css).toContain("background-color:#f0fdf4");
    expect(out.css).not.toContain("background-image");
  });

  it("uses Media URLs and alt when the images step provides them", () => {
    const out = run(IR, { media: { i1: { url: "https://assets.example/a.webp", alt: "Un potager" }, i3: { url: "https://assets.example/fond.webp", alt: "" } } });
    expect(out.html).toContain('src="https://assets.example/a.webp" alt="Un potager"');
    expect(out.css).toContain("background-image:url(https://assets.example/fond.webp)");
    expect(out.imagesPlaced).toEqual(expect.arrayContaining(["i1", "i2", "i3"]));
  });

  it("gives a Media image awaiting a description alt=\"\" and asks once per Media item to describe it (FR-013)", () => {
    const shared = { url: "https://assets.example/b.webp", alt: "", altPending: true };
    const out = run(IR, { media: { i1: shared, i2: shared } });
    expect(out.html).toContain('src="https://assets.example/b.webp" alt=""');
    expect(out.report.actionsBeforePublish).toContain("Décrire l'image marquée « À décrire » dans la médiathèque");
    expect(out.report.actionsBeforePublish.join(" ")).not.toMatch(/provisoire/);
  });

  it("counts every Media item to describe", () => {
    const out = run(IR, {
      media: {
        i1: { url: "https://assets.example/a.webp", alt: "", altPending: true },
        i2: { url: "https://assets.example/b.webp", alt: "", altPending: true },
      },
    });
    expect(out.report.actionsBeforePublish).toContain("Décrire les 2 images marquées « À décrire » dans la médiathèque");
  });

  it("lists the images step's failures in the report; a failed image keeps the placeholder (FR-014)", () => {
    const failedImages = [{ sourceUrl: "https://exemple.fr/b.jpg", reason: "too-large" as const }];
    const out = run(IR, { media: { i1: { url: "https://assets.example/a.webp", alt: "Un potager" } }, failedImages });
    expect(out.report.failedImages).toEqual(failedImages);
    expect(out.report.actionsBeforePublish).toContain("Remplacer l'image provisoire par une image de la médiathèque");
  });
});

describe("whole-link texts and card photos", () => {
  it("a text that is one link as a whole takes its text's colour; a link inside a sentence keeps the default", () => {
    const extract = {
      ...EXTRACT,
      texts: [...EXTRACT.texts, { ...EXTRACT.texts[0]!, id: "t20", tag: "h3", html: '<a href="https://exemple.fr/a">Un article</a>' }],
    };
    const ir: IRType = {
      ...IR,
      sections: [{ source: "Cartes", rows: [{ kind: "blocks", blocks: [{ kind: "rich-text", parts: [{ ref: "t20", as: "h3" }, { ref: "t6", as: "p" }] }] }] }],
    };
    const out = serializeImport(ir, extract, OPTS);
    const linkRules = out.projectData.styles.filter((r) => r.selectorsAdd);
    expect(linkRules).toHaveLength(1);
    expect(out.css).toMatch(/#imp-\d+ a\{color:inherit;text-decoration:none;\}/);
  });

  it("a column can carry a background photo (text on a card photo)", () => {
    const ir: IRType = {
      ...IR,
      sections: [
        {
          source: "Cartes",
          rows: [
            {
              kind: "columns",
              columns: [
                { style: { backgroundImage: "i1", paddingTop: 160 }, blocks: [{ kind: "rich-text", parts: [{ ref: "t4", as: "h3", style: { color: "#ffffff" } }] }] },
                { style: { backgroundImage: "i2" }, blocks: [{ kind: "rich-text", parts: [{ ref: "t5", as: "p" }] }] },
              ],
            },
          ],
        },
      ],
    };
    const out = run(ir, { media: { i1: { url: "https://assets.example/carte.webp", alt: "" } } });
    expect(out.css).toContain("background-image:url(https://assets.example/carte.webp)");
    expect(out.imagesPlaced).toContain("i1");
    expect(placedImageRefs(ir, EXTRACT)).toEqual(["i1", "i2"]);
    // No Media for i2: background dropped, reported.
    expect(out.report.simplified.some((s) => s.what === "1 image de fond")).toBe(true);
  });

  it("a photo card keeps its source photo's shape, text at the bottom, no tall spacer", () => {
    const extract = {
      ...EXTRACT,
      images: EXTRACT.images.map((i) => (i.id === "i1" ? { ...i, box: { x: 0, y: 0, width: 309, height: 309 } } : i)),
    };
    const card = {
      style: { backgroundImage: "i1", paddingTop: 200, paddingBottom: 20, paddingLeft: 20, paddingRight: 20 },
      devices: { mobile: { box: { paddingTop: 160 } } },
      blocks: [{ kind: "rich-text" as const, parts: [{ ref: "t4", as: "h3" as const }] }],
    };
    const ir: IRType = {
      ...IR,
      sections: [{ source: "Cartes", rows: [{ kind: "columns", columns: [card, { blocks: [{ kind: "rich-text", parts: [{ ref: "t5", as: "p" }] }] }] }] }],
    };
    const out = serializeImport(ir, extract, { ...OPTS, media: { i1: { url: "https://assets.example/carte.webp", alt: "" } } });
    const rule = out.projectData.styles.find((r) => r.style["background-image"] && !r.mediaText)!;
    expect(rule.style).toMatchObject({
      "aspect-ratio": "309 / 309",
      display: "flex",
      "flex-direction": "column",
      "justify-content": "flex-end",
      "padding-top": "20px",
    });
    const sel = rule.selectors[0];
    expect(out.projectData.styles.some((r) => r.selectors[0] === sel && r.mediaText && "padding-top" in r.style)).toBe(false);
  });

  it("a text block spans the section's content width, not the library's centred 720px column", () => {
    const ir: IRType = { ...IR, sections: [{ source: "Titre", rows: [{ kind: "blocks", blocks: [{ kind: "rich-text", parts: [{ ref: "t4", as: "h2" }] }] }] }] };
    const rule = serializeImport(ir, EXTRACT, OPTS).projectData.styles.find((r) => r.style.padding === "24px")!;
    expect(rule.style).not.toHaveProperty("max-width");
    expect(rule.style).not.toHaveProperty("margin");
  });

  it("a section's content width is the span measured on the source, the model's estimate only as a fallback", () => {
    const at = (x: number, width: number) => ({ x, y: 0, width, height: 40 });
    const extract = {
      ...EXTRACT,
      texts: EXTRACT.texts.map((t) => (t.id === "t4" ? { ...t, box: at(111, 400) } : t.id === "t5" ? { ...t, box: at(700, 382) } : t)),
    };
    const section = (contentMaxWidth: number, refs: string[]): IRType => ({
      ...IR,
      sections: [{ source: "S", contentMaxWidth, rows: [{ kind: "blocks", blocks: [{ kind: "rich-text", parts: refs.map((ref) => ({ ref, as: "p" as const })) }] }] }],
    });
    const inner = (ir: IRType) => serializeImport(ir, extract, OPTS).projectData.styles.find((r) => r.style.margin === "0 auto")!.style["max-width"];
    expect(inner(section(1240, ["t4", "t5"]))).toBe("971px");
    // One element only: nothing to measure a span from.
    expect(inner(section(1240, ["t4"]))).toBe("1240px");
  });

  it("an image without a model width takes the width measured in the source", () => {
    const extract = {
      ...EXTRACT,
      images: EXTRACT.images.map((i) => (i.id === "i1" ? { ...i, box: { x: 0, y: 0, width: 280, height: 180 } } : i)),
    };
    const ir: IRType = { ...IR, sections: [{ source: "Image", rows: [{ kind: "blocks", blocks: [{ kind: "image", image: "i1" }] }] }] };
    expect(serializeImport(ir, extract, OPTS).css).toMatch(/#imp-\d+\{max-width:100%;width:280px;\}/);
    const withModel: IRType = { ...ir, sections: [{ source: "Image", rows: [{ kind: "blocks", blocks: [{ kind: "image", image: "i1", maxWidth: 500 }] }] }] };
    expect(serializeImport(withModel, extract, OPTS).css).toContain("width:500px");
  });
});

describe("placedImageRefs", () => {
  it("lists the backgrounds and images the IR places, known to the extract, in order, once", () => {
    const ir: IRType = {
      ...IR,
      sections: [
        ...IR.sections,
        { source: "doublon", style: { backgroundImage: "i404" }, rows: [{ kind: "blocks", blocks: [{ kind: "image", image: "i1" }] }] },
      ],
    };
    expect(placedImageRefs(ir, EXTRACT)).toEqual(run(ir, { media: { i3: { url: "u", alt: "" } } }).imagesPlaced.filter((r, i, a) => a.indexOf(r) === i));
    expect(placedImageRefs(ir, EXTRACT)).not.toContain("i404");
    expect(new Set(placedImageRefs(ir, EXTRACT)).size).toBe(placedImageRefs(ir, EXTRACT).length);
  });
});

describe("per-device styles (FR-011a, research R15)", () => {
  const out = run();
  const heroHeadingId = /<h1 id="(imp-\d+)"/.exec(out.html)![1]!;
  const rulesFor = (id: string) => out.projectData.styles.filter((r) => r.selectors[0] === `#${id}`);

  it("stores device overrides as #id rules under the editor's Tablet and Mobile portrait conditions", () => {
    const rules = rulesFor(heroHeadingId);
    expect(rules.find((r) => !r.mediaText)?.style).toEqual({ color: "#14532d", "font-size": "56px" });
    expect(rules.find((r) => r.mediaText === DEVICE_BREAKPOINTS.tablet)).toMatchObject({ atRuleType: "media", style: { "font-size": "40px" } });
    expect(rules.find((r) => r.mediaText === DEVICE_BREAKPOINTS.mobilePortrait)).toMatchObject({ atRuleType: "media", style: { "font-size": "32px" } });
    expect(out.css).toContain(`@media ${DEVICE_BREAKPOINTS.tablet}{`);
    expect(out.css).toMatch(new RegExp(`@media \\(max-width: 480px\\)\\{[^@]*#${heroHeadingId}\\{font-size:32px;\\}`));
  });

  it("emits nothing for Mobile landscape", () => {
    expect(out.projectData.styles.some((r) => r.mediaText === DEVICE_BREAKPOINTS.mobileLandscape)).toBe(false);
    expect(out.css).not.toContain("768px");
  });

  it("turns `hidden` into display:none on that device", () => {
    const figure = /<figure data-block="image" id="(imp-\d+)"/.exec(out.html)![1]!;
    expect(rulesFor(figure).find((r) => r.mediaText === DEVICE_BREAKPOINTS.mobilePortrait)?.style).toEqual({ display: "none" });
  });

  it("drops an override equal to the value it would inherit", () => {
    const ir: IRType = {
      ...IR,
      sections: [
        {
          source: "X",
          rows: [{ kind: "blocks", blocks: [{ kind: "hero", heading: "t1", headingLevel: 1, headingStyle: { fontSize: 40 }, devices: { tablet: { text: { fontSize: 40 } }, mobile: { text: { fontSize: 40 } } } }] }],
        },
      ],
    };
    const res = run(ir);
    expect(res.projectData.styles.some((r) => r.mediaText)).toBe(false);
    expect(res.css).not.toContain("@media");
  });
});

describe("report", () => {
  it("carries the IR's simplifications, omissions, mobile flag, fonts and counts", () => {
    const { report } = run();
    expect(report.finalUrl).toBe("https://exemple.fr/offre");
    expect(report.simplified[0]).toEqual({ what: "Carrousel d'avis", how: "premier avis conservé" });
    expect(report.omitted[0]).toEqual({ what: "Vidéo de présentation", reason: "video" });
    expect(report.sourceHadMobileLayout).toBe(true);
    expect(report.fontSubstitutions).toEqual(["Montserrat", "Open Sans"]);
    expect(report.reproduced.sections).toBe(2);
    expect(report.reproduced.blocks).toMatchObject({ hero: 1, image: 2, "rich-text": 1, testimonial: 1, "call-to-action": 1 });
    expect(report.accessibility.some((f) => f.kind === "missing-alt")).toBe(true);
  });
});
