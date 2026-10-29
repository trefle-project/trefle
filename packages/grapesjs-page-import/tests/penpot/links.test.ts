import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { convertBoard, type ConvertContext } from "../../src/penpot/convert";
import { linkFor } from "../../src/penpot/links";
import type { Shape } from "../../src/penpot/model";
import { readPenpotFile } from "../../src/penpot/read";
import { board, penpotZip } from "./builders";

/** 015-penpot-site-import T032 — research P10, contract guarantee 8 (FR-016–FR-018). */

const ctx = (paths: Record<string, string>): ConvertContext => ({
  paths,
  images: {},
  fonts: new Set(),
  fileName: "site.penpot",
});
const text = (id: string, label: string, over: Partial<Shape> = {}): Partial<Shape> => ({
  id,
  name: id,
  type: "text",
  parentId: "home",
  x: 0,
  y: 0,
  width: 200,
  height: 20,
  content: {
    type: "root",
    children: [
      {
        type: "paragraph-set",
        children: [
          { type: "paragraph", fontSize: "16", children: [{ text: label, fontSize: "16" }] },
        ],
      },
    ],
  },
  ...over,
});
const go = (destination: string) => [{ eventType: "click", actionType: "navigate", destination }];
const url = (u: string) => [{ eventType: "click", actionType: "open-url", url: u }];

function site(shapes: Partial<Shape>[]) {
  const f = readPenpotFile(
    penpotZip({
      pages: [
        {
          id: "p",
          name: "Site",
          shapes: [
            board("home", "Accueil", {
              layout: "flex",
              layoutFlexDir: "column",
              shapes: shapes
                .filter((s) => s.parentId === "home")
                .map((s) => s.id!)
                .reverse(),
            }),
            board("about", "À propos", { x: 2000 }),
            ...shapes,
          ],
        },
        { id: "q", name: "Other", shapes: [board("elsewhere", "Ailleurs")] },
      ],
    }),
  );
  return (paths: Record<string, string>) => convertBoard(f, "p", "home", ctx(paths));
}
const parse = (html: string) =>
  new DOMParser().parseFromString(`<body>${html}</body>`, "text/html").body;

describe("linkFor", () => {
  const report = () => ({ omitted: [] as { what: string; reason: "interaction" }[] });
  const s = (interactions: unknown[]): Shape => ({
    id: "x",
    name: "Menu",
    type: "text",
    interactions: interactions as Shape["interactions"],
  });
  it("navigate → the ticked board's path; open-url → http(s), mailto, tel", () => {
    expect(linkFor(s(go("about")), { about: "/a-propos" }, report())).toEqual({
      href: "/a-propos",
    });
    for (const u of [
      "https://penpot.app",
      "http://exemple.fr/x?y=1",
      "mailto:hello@example.com",
      "tel:+33 1 23 45 67 89",
    ]) {
      expect(linkFor(s(url(u)), {}, report())).toEqual({ href: u });
    }
  });
  it("unticked or foreign boards, unsafe schemes and non-click interactions are reported, not linked", () => {
    const r = report();
    expect(linkFor(s(go("about")), {}, r)).toBeNull();
    expect(linkFor(s(url("javascript:alert(1)")), {}, r)).toBeNull();
    expect(linkFor(s(url("data:text/html,x")), {}, r)).toBeNull();
    expect(
      linkFor(
        s([{ eventType: "mouse-enter", actionType: "navigate", destination: "about" }]),
        { about: "/a" },
        r,
      ),
    ).toBeNull();
    expect(
      linkFor(
        s([{ eventType: "click", actionType: "open-overlay", destination: "about" }]),
        { about: "/a" },
        r,
      ),
    ).toBeNull();
    expect(r.omitted.map((o) => o.what)).toEqual([
      "Lien de « Menu » vers un board non importé",
      "Lien de « Menu » vers une adresse non autorisée",
      "Lien de « Menu » vers une adresse non autorisée",
      "Interaction « mouse-enter » sur « Menu » (non reprise)",
      "Interaction « open-overlay » sur « Menu » (non reprise)",
    ]);
  });
});

describe("links in converted pages", () => {
  const convert = site([
    text("t-about", "À propos", { interactions: go("about") as never }),
    text("t-mail", "Contact", { interactions: url("mailto:hello@example.com") as never }),
    text("t-js", "Piège", { interactions: url("javascript:alert(1)") as never }),
    text("t-far", "Ailleurs", { interactions: go("elsewhere") as never }),
    {
      id: "card",
      name: "Carte article",
      type: "frame",
      parentId: "home",
      layout: "flex",
      layoutFlexDir: "column",
      x: 0,
      y: 100,
      width: 300,
      height: 100,
      shapes: ["t-inner"],
      interactions: go("about") as never,
      fills: [{ fillColor: "#eeeeee" }],
    },
    text("t-inner", "Lire l'article", {
      parentId: "card",
      interactions: url("https://exemple.fr") as never,
    }),
  ]);

  it("a text's content is wrapped; a box becomes the link; the link look is a rule on the text", () => {
    const out = convert({ home: "/", about: "/a-propos" });
    const body = parse(out.html);
    const about = [...body.querySelectorAll("a")].find((a) => a.textContent === "À propos")!;
    expect(about.getAttribute("href")).toBe("/a-propos");
    expect(["P", "H1"]).toContain(about.parentElement!.tagName);
    expect(out.css).toContain(`#${about.parentElement!.id} a{color:inherit;text-decoration:none;}`);
    expect(body.querySelector('a[href="mailto:hello@example.com"]')?.textContent).toBe("Contact");
    const card = [...body.querySelectorAll("a")].find((a) =>
      a.textContent?.includes("Lire l'article"),
    )!;
    expect(card.getAttribute("href")).toBe("/a-propos");
    expect(card.querySelector("a")).toBeNull(); // no link inside a link
  });

  it("only ticked paths and safe schemes appear; everything dropped is reported", () => {
    const out = convert({ home: "/" });
    const hrefs = [...parse(out.html).querySelectorAll("a")].map((a) => a.getAttribute("href"));
    // The card's link is dropped, so the link inside it is no longer nested: it stays.
    expect(hrefs.sort()).toEqual(["https://exemple.fr", "mailto:hello@example.com"]);
    expect(out.html).not.toMatch(/javascript:/);
    const what = out.report.omitted.map((o) => o.what);
    expect(what).toContain("Lien de « t-about » vers un board non importé");
    expect(what).toContain("Lien de « t-far » vers un board non importé");
    expect(what).toContain("Lien de « t-js » vers une adresse non autorisée");
    expect(out.report.omitted.every((o) => o.reason === "interaction")).toBe(true);
  });

  it("a nested link is dropped and reported", () => {
    const out = convert({ home: "/", about: "/a-propos" });
    expect(out.report.omitted.map((o) => o.what)).toContain(
      "Lien de « t-inner » dans un autre lien (non repris)",
    );
  });

  it("a changed path is used everywhere", () => {
    const out = convert({ home: "/", about: "/qui-sommes-nous" });
    const hrefs = [...parse(out.html).querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.filter((h) => h === "/qui-sommes-nous")).toHaveLength(2);
  });
});

describe("links on the reference fixture", () => {
  it("blog-mini: post titles on Accueil lead to the Article page; Contact is a mailto link", () => {
    const f = readPenpotFile(
      new Uint8Array(readFileSync(join(__dirname, "../fixtures/blog-mini.penpot"))),
    );
    const p = f.pages.find((x) => x.name === "Site")!;
    const [home, article] = p.boards;
    const out = convertBoard(
      f,
      p.id,
      home!.id,
      ctx({ [home!.id]: "/", [article!.id]: "/article" }),
    );
    const hrefs = [...parse(out.html).querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs.filter((h) => h === "/article").length).toBeGreaterThan(3);
    expect(hrefs).toContain("mailto:hello@example.com");
    expect(hrefs).toContain("https://penpot.app");
    expect(
      hrefs.every((h) => h === "/" || h === "/article" || /^(https?:|mailto:)/.test(h ?? "")),
    ).toBe(true);
  });
});
