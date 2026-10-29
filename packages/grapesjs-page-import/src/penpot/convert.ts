import { checkAccessibility, type A11yItem } from "../a11y";
import type { ImportReport } from "../serialize";
import {
  containerCss,
  fitsMobile,
  freeContainerCss,
  freeItemCss,
  gridCells,
  isRow,
  itemCss,
  padding,
  type DeviceStyles,
} from "./layout";
import type { GridCell, Shape } from "./model";
import {
  collectRules,
  idMaker,
  node,
  toComponent,
  toHtml,
  type ComponentJson,
  type Node,
  type StyleRule,
} from "./node";
import { box, type PenpotFile } from "./read";
import {
  cqwUnits,
  effectsCss,
  fillCss,
  flatten,
  PX,
  radiusCss,
  round,
  shadowCss,
  strokeCss,
  type Style,
  type Units,
} from "./style";
import { linkFor, type LinkReport } from "./links";
import { isVectorCluster, isVectorLeaf, meaningfulName, svgNode, svgRawNode } from "./svg";
import {
  assignHeadings,
  buildParagraph,
  familyOf,
  isGoogleFont,
  paragraphs,
  paragraphText,
  type FontContext,
} from "./text";

/**
 * One Penpot board → one page's GrapesJS content (015-penpot-site-import,
 * contracts/penpot-conversion.md). Pure: the CMS resolves images and fonts
 * first (`boardNeeds`), then passes what it stored in `ctx`.
 */

export type StoredImage = { url: string; alt: string; altPending: boolean };

export type ConvertContext = {
  /** Ticked board id → its page path (links, research P10; used from US2 on). */
  paths: Record<string, string>;
  /** Penpot media id → stored Media, or null when it could not be stored. */
  images: Record<string, StoredImage | null>;
  /** Font families available on the domain; any other family falls back to a generic stack. */
  fonts: Set<string>;
  /** Shown in the report instead of 012's source address. */
  fileName: string;
};

export type ProjectData = {
  assets: unknown[];
  styles: StyleRule[];
  pages: { frames: { component: ComponentJson }[] }[];
};

export type ConvertResult = {
  projectData: ProjectData;
  html: string;
  css: string;
  report: ImportReport;
  bytes: number;
};

export type BoardNeeds = {
  fonts: {
    family: string;
    googleFamily: string | null;
    weight: number;
    style: "normal" | "italic";
  }[];
  images: { mediaId: string; displayWidth: number; name: string }[];
};

/** Above this many bytes the editor cannot save the page (research P3). */
export const MAX_PAGE_BYTES = 450 * 1024;

/**
 * The Image block's neutral placeholder, for images that could not be stored
 * (012 FR-014 rule). URL-encoded, not base64: the Pages hook
 * `rejectInlineImages` refuses base64 `data:` images.
 */
export const IMAGE_PLACEHOLDER =
  "data:image/svg+xml;charset=utf-8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="#e5e7eb"/></svg>',
  );

const visible = (s: Shape | undefined): s is Shape => Boolean(s && !s.hidden);
const kidsOf = (s: Shape, shapes: Map<string, Shape>) =>
  (s.shapes ?? []).map((id) => shapes.get(id)).filter(visible);
const imageFillOf = (s: Shape) => (s.fills ?? []).find((f) => f?.fillImage?.id)?.fillImage;

/** DOM order of a container's children (research P4): grids by cell (row, column), everything else reversed. */
function domChildren(s: Shape, shapes: Map<string, Shape>): Shape[] {
  const kids = kidsOf(s, shapes);
  if (s.layout === "grid") {
    const cells = gridCells(s);
    const pos = (c: Shape) => {
      const cell = cells.get(c.id);
      return cell ? [Number(cell.row) || 0, Number(cell.column) || 0] : [Infinity, Infinity];
    };
    return [...kids].reverse().sort((a, b) => pos(a)[0]! - pos(b)[0]! || pos(a)[1]! - pos(b)[1]!);
  }
  return [...kids].reverse();
}

// ---------------------------------------------------------------- needs

export function boardNeeds(file: PenpotFile, pageId: string, boardIds: string[]): BoardNeeds {
  const shapes = file.shapes(pageId);
  const fonts = new Map<string, BoardNeeds["fonts"][number]>();
  const images = new Map<string, BoardNeeds["images"][number]>();
  const walk = (s: Shape) => {
    const img = imageFillOf(s);
    if (img) {
      const prev = images.get(img.id);
      const w = box(s).width;
      if (!prev || prev.displayWidth < w)
        images.set(img.id, { mediaId: img.id, displayWidth: Math.round(w), name: s.name });
    }
    if (s.type === "text") {
      for (const p of paragraphs(s.content)) {
        for (const t of [p, ...(p.children ?? [])]) {
          const family = familyOf(t);
          if (!family) continue;
          const weight = Number(t.fontWeight) || 400;
          const style = t.fontStyle === "italic" ? "italic" : "normal";
          const key = `${family}|${weight}|${style}`;
          if (!fonts.has(key))
            fonts.set(key, {
              family,
              googleFamily: isGoogleFont(t) ? family : null,
              weight,
              style,
            });
        }
      }
    }
    kidsOf(s, shapes).forEach(walk);
  };
  for (const id of boardIds) {
    const b = shapes.get(id);
    if (visible(b)) walk(b);
  }
  return { fonts: [...fonts.values()], images: [...images.values()] };
}

/** « Auto width » texts up to this width are labels: their row never squeezes them (desktop, tablet). */
const SHORT_LABEL = 200;

// ---------------------------------------------------------------- carousels

const CAROUSEL_NAME = /\b(carousel|carrousel|slider|swiper|slideshow)\b/i;
const DOTS_NAME = /\b(dots?|pagination|bullets?|indicators?)\b|dot-(full|empty|active)/i;

/**
 * Penpot has no carousel: designers draw the visible slide plus pagination
 * dots. A frame named like a carousel, or a row of 2–10 small items
 * (≤ 24 px) named like dots, marks one. Reported, never converted.
 */
function looksLikeCarousel(s: Shape, kids: Shape[]): boolean {
  if (CAROUSEL_NAME.test(s.name ?? "")) return true;
  if (kids.length < 2 || kids.length > 10) return false;
  if (s.layout === "flex" && !isRow(s)) return false;
  if (!kids.every((k) => box(k).width <= 24 && box(k).height <= 24)) return false;
  return DOTS_NAME.test(s.name ?? "") || kids.some((k) => DOTS_NAME.test(k.name ?? ""));
}

// ---------------------------------------------------------------- conversion

type Where = {
  u: Units;
  parent?: Shape;
  /** How the parent places this shape. */
  placement: "board" | "flex" | "grid" | "free";
  cells?: Map<string, GridCell>;
  /** The parent is a row that stacks on mobile. */
  parentStacks?: boolean;
  /** Painting order inside a free container. */
  z?: number;
  /** Nearest background for contrast checks: a colour, or "image". */
  background: string;
  board: Shape;
  /** Inside a link already: no nested link (HTML forbids it). */
  inLink?: boolean;
};

/** Placement keys a link wrapper takes over from the image or svg it wraps. */
const PLACEMENT_KEYS = [
  "position",
  "left",
  "top",
  "z-index",
  "width",
  "max-width",
  "min-width",
  "height",
  "min-height",
  "max-height",
  "aspect-ratio",
  "flex",
  "flex-shrink",
  "align-self",
  "justify-self",
  "margin",
  "grid-column",
  "grid-row",
];

const plainText = (n: Node): string =>
  typeof n.children === "string"
    ? n.children
        .replace(/<[^>]*>/g, "")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
    : n.children.map(plainText).join(" ");
const altOf = (n: Node): string =>
  (n.tag === "img" ? (n.attrs.find(([k]) => k === "alt")?.[1] ?? "") : "") +
  (typeof n.children === "string" ? "" : n.children.map(altOf).join(""));
const escAttr = (v: string) =>
  v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

export function convertBoard(
  file: PenpotFile,
  pageId: string,
  boardId: string,
  ctx: ConvertContext,
): ConvertResult {
  const shapes = file.shapes(pageId);
  const board = shapes.get(boardId);
  if (!board || board.type !== "frame")
    throw new Error(`board ${boardId} not found on page ${pageId}`);

  const ids = idMaker();
  const fonts: FontContext = { available: ctx.fonts, substituted: new Set() };
  const a11y: A11yItem[] = [];
  const report: ImportReport = {
    finalUrl: ctx.fileName,
    reproduced: { sections: 0, columns: 0, blocks: {}, images: 0 },
    simplified: [],
    omitted: [],
    failedImages: [],
    fontSubstitutions: [],
    accessibility: [],
    deviceChecks: [],
    sourceHadMobileLayout: false,
    actionsBeforePublish: [],
  };
  const count = (kind: string) =>
    (report.reproduced.blocks[kind] = (report.reproduced.blocks[kind] ?? 0) + 1);
  const notes = {
    rotation: 0,
    extraFills: 0,
    extraStrokes: 0,
    blend: 0,
    mask: 0,
    free: [] as string[],
    missingBackgrounds: 0,
    /** Sections that look like carousels (named so, or with pagination dots). */
    carousels: [] as string[],
  };

  // Heading levels need every text of the board, in DOM order.
  const texts: Shape[] = [];
  const collect = (s: Shape) => {
    if (s.type === "text") texts.push(s);
    else if (!isVectorCluster(s, shapes)) domChildren(s, shapes).forEach(collect);
  };
  collect(board);
  const headings = assignHeadings(texts, file.typographies());

  /** Sizing + placement given by the parent. */
  const placementCss = (s: Shape, w: Where, leaf: boolean): DeviceStyles => {
    if (w.placement === "board") return { base: {}, tablet: {}, mobile: {} };
    if (w.placement === "free")
      return { base: freeItemCss(s, w.parent!, w.u, w.z ?? 1), tablet: {}, mobile: {} };
    const fullWidth =
      w.parent === w.board &&
      w.placement === "flex" &&
      !isRow(w.parent) &&
      box(s).width >= box(w.board).width - 1;
    return itemCss(s, w.parent!, w.u, {
      leaf,
      fullWidth,
      cell: w.cells?.get(s.id),
      parentStacks: w.parentStacks,
    });
  };

  /** Box visuals shared by containers and leaves. */
  const visualCss = (s: Shape, u: Units): Style => {
    const st: Style = {};
    const f = fillCss(s.fills);
    notes.extraFills += f.extraFills ? 1 : 0;
    Object.assign(st, f.style);
    const k = strokeCss(s.strokes, u);
    notes.extraStrokes += k.extraStrokes > 0 ? 1 : 0;
    Object.assign(st, k.style, radiusCss(s, u), shadowCss(s, u));
    const e = effectsCss(s, u);
    for (const n of e.notes) {
      if (n === "rotation") notes.rotation++;
      if (n === "blend-mode") notes.blend++;
      if (n === "mask") notes.mask++;
    }
    Object.assign(st, e.style);
    return st;
  };

  const backgroundOf = (st: Style, fallback: string): string => {
    if (st["background-image"]) return "image";
    // A translucent background shows the one behind it (« image » stays unverifiable).
    if (fallback === "image") return st["background-color"] && /^#/.test(st["background-color"]) ? st["background-color"] : fallback;
    return flatten(st["background-color"], fallback) ?? fallback;
  };

  const apply = (n: Node, d: DeviceStyles, extra: Style = {}) => {
    Object.assign(n.base, d.base, extra);
    Object.assign(n.tablet, d.tablet);
    Object.assign(n.mobile, d.mobile);
  };

  const finish = (n: Node, s: Shape, suffix = ""): Node => {
    // Penpot sizes include padding and borders.
    if (n.base.padding || n.base.border) n.base["box-sizing"] = "border-box";
    if (Object.keys(n.base).length || Object.keys(n.tablet).length || Object.keys(n.mobile).length)
      n.id = ids(s.id, suffix);
    return n;
  };

  /** Images and placeholder boxes keep their proportions when they shrink (not inside free containers). */
  const keepRatio = (n: Node, s: Shape, w: Where) => {
    if (w.u.free || n.base.position === "absolute") return;
    const b = box(s);
    if (b.height <= 4 || b.width <= 0 || !n.base.height || n.base.height.endsWith("cqw")) return;
    // Wider than its parent: Penpot crops it, so the visible part keeps the full height.
    let width = b.width;
    if (w.parent && w.placement !== "board") {
      const [, right, , left] = padding(w.parent);
      width = Math.min(width, Math.max(1, box(w.parent).width - left - right));
    }
    delete n.base.height;
    n.base.height = "auto";
    n.base["aspect-ratio"] = `${round(width)} / ${round(b.height)}`;
  };

  const linkReport: LinkReport = { omitted: [] };

  /** Turns a built element into a link (research P10): text content wrapped, a box becoming `a`, an image or svg wrapped. */
  const makeLink = (n: Node, s: Shape, href: string): Node => {
    let out: Node;
    if (n.type === "text" && typeof n.children === "string") {
      const underline =
        /text-decoration:underline/.test(n.children) || n.base["text-decoration"] === "underline";
      // Link look as a rule on the text (GrapesJS turns inline styles of inner elements into generated ids).
      n.children = `<a href="${escAttr(href)}">${n.children}</a>`;
      n.descendants = {
        ...n.descendants,
        " a": { color: "inherit", "text-decoration": underline ? "underline" : "none" },
      };
      n.id ??= ids(s.id);
      out = n;
    } else if (n.tag === "div") {
      n.tag = "a";
      n.type = "link";
      n.attrs.push(["href", href]);
      Object.assign(n.base, {
        display: n.base.display ?? "block",
        color: "inherit",
        "text-decoration": "none",
      });
      out = n;
    } else {
      const wrapper = node("a", { type: "link", attrs: [["href", href]], children: [n] });
      for (const k of PLACEMENT_KEYS) {
        if (n.base[k] !== undefined) {
          wrapper.base[k] = n.base[k]!;
          delete n.base[k];
        }
        for (const dev of ["tablet", "mobile"] as const) {
          if (n[dev][k] !== undefined) {
            wrapper[dev][k] = n[dev][k]!;
            delete n[dev][k];
          }
        }
      }
      Object.assign(wrapper.base, { display: "block" });
      Object.assign(n.base, { width: "100%", height: n.tag === "img" ? "100%" : "auto" });
      out = finish(wrapper, s, "-link");
    }
    const text = (plainText(n) + " " + altOf(n)).replace(/\s+/g, " ").trim();
    if (!text) {
      const name = meaningfulName(s.name);
      if (name) out.attrs.push(["aria-label", name]);
    }
    a11y.push({ kind: "link", text: text || meaningfulName(s.name) || "", where: s.name });
    return out;
  };

  const build = (s: Shape, w: Where): Node | null => {
    if (!visible(s)) return null;
    const link = linkFor(s, ctx.paths, linkReport);
    if (link && w.inLink) {
      linkReport.omitted.push({
        what: `Lien de « ${s.name} » dans un autre lien (non repris)`,
        reason: "interaction",
      });
    }
    const own = link && !w.inLink ? link : null;
    const n = buildShape(s, own ? { ...w, inLink: true } : w);
    return n && own ? makeLink(n, s, own.href) : n;
  };

  const buildShape = (s: Shape, w: Where): Node | null => {
    // Vectors → one inline svg
    if (isVectorLeaf(s) || isVectorCluster(s, shapes) || s.type === "svg-raw") {
      const label = meaningfulName(s.name);
      const n = s.type === "svg-raw" ? svgRawNode(s, label) : svgNode(s, shapes, label);
      if (!n) {
        report.omitted.push({ what: s.name, reason: "other" });
        return null;
      }
      apply(n, placementCss(s, w, true), { display: "block", ...effectsCss(s, w.u).style });
      if (!n.base.width) n.base.width = w.u.len(box(s).width);
      if (!n.base.height) n.base.height = "auto";
      if (!w.u.free) n.base["max-width"] = "100%";
      n.base["flex-shrink"] = "0";
      count("svg");
      return finish(n, s);
    }

    if (s.type === "text") return buildText(s, w);

    const img = imageFillOf(s);
    if (
      (s.type === "rect" || s.type === "circle" || s.type === "image") &&
      (img || s.type === "image")
    ) {
      const mediaId = img?.id ?? s.metadata?.id;
      const stored = mediaId ? ctx.images[mediaId] : null;
      if (!stored) report.failedImages.push({ sourceUrl: s.name, reason: "unreachable" });
      const alt = stored && !stored.altPending ? stored.alt : "";
      const n = node("img", {
        type: "image",
        attrs: [
          ["src", stored?.url ?? IMAGE_PLACEHOLDER],
          ["alt", alt],
        ],
      });
      apply(n, placementCss(s, w, true), {
        display: "block",
        "object-fit": img?.keepAspectRatio === false ? "fill" : "cover",
        ...radiusCss(s, w.u),
        ...strokeCss(s.strokes, w.u).style,
        ...shadowCss(s, w.u),
        ...effectsCss(s, w.u).style,
      });
      if (s.type === "circle") n.base["border-radius"] = "50%";
      keepRatio(n, s, w);
      a11y.push({ kind: "image", alt: alt || null, where: s.name });
      report.reproduced.images++;
      count("image");
      return finish(n, s);
    }

    if (s.type === "rect" || s.type === "circle") {
      const n = node("div");
      apply(n, placementCss(s, w, true), visualCss(s, w.u));
      if (s.type === "circle") n.base["border-radius"] = "50%";
      keepRatio(n, s, w);
      count("box");
      return finish(n, s);
    }

    if (s.type === "frame" || s.type === "group") return buildContainer(s, w);

    report.omitted.push({ what: s.name, reason: "other" });
    return null;
  };

  const buildText = (s: Shape, w: Where): Node | null => {
    const paras = paragraphs(s.content).filter((p) => (p.children ?? []).length);
    if (!paras.length) return null;
    const place = placementCss(s, w, false);
    // « Auto width » in Penpot: the box is as wide as its text. Its measured width is a hair
    // narrower than the browser's, so it is not imposed (« About Us » broke in two); the text
    // takes its natural width and wraps only when its container is narrower.
    if (
      s.growType === "auto-width" &&
      !w.u.free &&
      !s.layoutItemAbsolute &&
      (w.placement === "flex" || w.placement === "grid") &&
      (s.layoutItemHSizing ?? "fix") === "fix"
    ) {
      delete place.base.width;
      place.base["max-width"] ??= "100%";
      // A short label (menu item, name, button) is never squeezed by its row, except on a phone.
      if (w.parent && isRow(w.parent) && box(s).width <= SHORT_LABEL) {
        place.base["flex-shrink"] = "0";
        place.mobile["flex-shrink"] = "1";
      }
    }
    const shadow = shadowCss(s, w.u, true);
    const effects = effectsCss(s, w.u).style;
    const sizing: Style = {};
    if (w.placement === "board" || (w.placement !== "free" && !s.layoutItemHSizing)) {
      if (s.growType !== "auto-width")
        sizing.width = w.u.free ? w.u.len(box(s).width) : `min(${w.u.len(box(s).width)}, 100%)`;
    }
    const one = (i: number, tag: string): Node => {
      const p = buildParagraph(paras[i]!, w.u, fonts);
      // A blank line in Penpot is an empty paragraph: keep its height (an empty <p> has none).
      const blank = !paragraphText(paras[i]!).trim();
      const n = node(tag, { type: "text", children: blank ? "<br>" : p.html });
      Object.assign(n.base, { margin: "0" }, p.style);
      if (!w.u.free && p.fontSize > 28)
        n.mobile["font-size"] = `${Math.max(24, Math.round(p.fontSize * 0.7))}px`;
      if (!blank)
        a11y.push({
          kind: "text",
          tag,
          color: (w.background === "image" ? p.color : flatten(p.color, w.background)) ?? "#000000",
          background: w.background,
          fontSize: p.fontSize,
          bold: p.bold,
          where: s.name,
        });
      count("text");
      return n;
    };
    if (paras.length === 1) {
      const n = one(0, headings.get(s.id) ?? "p");
      apply(n, place, { ...sizing, ...shadow, ...effects });
      return finish(n, s);
    }
    const wrapper = node("div", { children: paras.map((_, i) => one(i, "p")) });
    apply(wrapper, place, { ...sizing, ...shadow, ...effects });
    (wrapper.children as Node[]).forEach((c, i) => finish(c, s, `-${i + 1}`));
    return finish(wrapper, s);
  };

  const buildContainer = (s: Shape, w: Where): Node | null => {
    const isBoard = s === board;
    const kids = domChildren(s, shapes);
    if (!isBoard && looksLikeCarousel(s, kids)) {
      // The section holding the dots (or the carousel frame itself) is what the editor recognises.
      const section = CAROUSEL_NAME.test(s.name ?? "") || !w.parent || w.parent === board ? s : w.parent;
      const name = meaningfulName(section.name) ?? section.name;
      if (!notes.carousels.includes(name)) notes.carousels.push(name);
    }
    const n = node("div");
    const visuals = s.type === "group" ? effectsCss(s, w.u).style : visualCss(s, w.u);
    const img = imageFillOf(s);
    if (img) {
      const stored = ctx.images[img.id];
      if (stored)
        Object.assign(visuals, {
          "background-image": `url("${stored.url}")`,
          "background-size": "cover",
          "background-position": "center",
          "background-repeat": "no-repeat",
        });
      else {
        notes.missingBackgrounds++;
        report.failedImages.push({ sourceUrl: s.name, reason: "unreachable" });
      }
    }
    // Penpot clips a frame's content unless « show content » is on; free frames always clip (they scale).
    if (
      s.type === "frame" &&
      !isBoard &&
      (s.showContent === false || s.layout == null) &&
      s.showContent !== true
    )
      visuals.overflow = "hidden";
    const background = backgroundOf(visuals, w.background);

    let childWhere: Omit<Where, "z">;
    if (s.layout === "flex" || s.layout === "grid") {
      const layout = containerCss(s, kids, w.u);
      apply(n, isBoard ? { base: {}, tablet: {}, mobile: {} } : placementCss(s, w, false), visuals);
      apply(n, layout);
      if (kids.some((k) => k.layoutItemAbsolute) && n.base.position !== "absolute")
        n.base.position = "relative";
      childWhere = {
        u: w.u,
        parent: s,
        placement: s.layout,
        cells: s.layout === "grid" ? gridCells(s) : undefined,
        parentStacks: s.layout === "flex" && isRow(s) && !fitsMobile(s, kids),
        background,
        board,
        inLink: w.inLink,
      };
      if (s.layout === "flex" && isRow(s)) report.reproduced.columns++;
      if (s.layout === "grid") report.reproduced.columns++;
    } else {
      // Freely positioned content (research P6)
      if (!w.u.free && kids.length) {
        notes.free.push(s.name);
        if (isBoard)
          report.actionsBeforePublish.push(
            "Cette page ne se réorganise pas sur mobile : adaptez-la avant de la publier",
          );
      }
      const place = isBoard ? { base: {}, tablet: {}, mobile: {} } : placementCss(s, w, false);
      delete place.base["min-height"];
      apply(n, place, { ...visuals, ...freeContainerCss(s, isBoard) });
      // Placed absolutely by its parent: stays absolute (an absolute box is a containing block too).
      if (place.base.position === "absolute") {
        n.base.position = "absolute";
        delete n.base["aspect-ratio"];
      }
      childWhere = {
        u: cqwUnits(box(s).width),
        parent: s,
        placement: "free",
        background,
        board,
        inLink: w.inLink,
      };
    }

    // Painting order inside free containers: Penpot's array order (bottom first).
    const order = new Map((s.shapes ?? []).map((id, i) => [id, i + 1]));
    n.children = kids
      .map((k) => build(k, { ...childWhere, z: order.get(k.id) }))
      .filter((c): c is Node => Boolean(c));
    if (isBoard) report.reproduced.sections = n.children.length;
    if (!n.children.length && !Object.keys(visuals).length && !isBoard) return null;
    count("box");
    return finish(n, s);
  };

  const root =
    buildContainer(board, { u: PX, placement: "board", background: "#ffffff", board }) ??
    node("div");

  // Report
  report.omitted.push(...linkReport.omitted);
  if (notes.free.length) {
    const names =
      notes.free
        .slice(0, 8)
        .map((n) => `« ${n} »`)
        .join(", ") + (notes.free.length > 8 ? ` et ${notes.free.length - 8} autres` : "");
    report.simplified.push({
      what: `Positionnement libre : ${names}`,
      how: "réduit proportionnellement sur mobile, sans réorganisation",
    });
  }
  if (notes.rotation)
    report.simplified.push({
      what: `${notes.rotation} élément(s) pivoté(s)`,
      how: "rotation reproduite, vérifiez l'affichage",
    });
  if (notes.extraFills)
    report.simplified.push({
      what: `${notes.extraFills} élément(s) à plusieurs remplissages`,
      how: "seul le premier remplissage est repris",
    });
  if (notes.extraStrokes)
    report.simplified.push({
      what: `${notes.extraStrokes} élément(s) à plusieurs contours`,
      how: "seul le premier contour est repris",
    });
  if (notes.blend)
    report.simplified.push({ what: `${notes.blend} mode(s) de fusion`, how: "non reproduits" });
  if (notes.mask)
    report.simplified.push({ what: `${notes.mask} masque(s)`, how: "non reproduits" });
  for (const name of notes.carousels)
    report.simplified.push({
      what: `Carrousel « ${name} »`,
      how: "reproduit tel que dessiné : seule la diapositive visible, sans défilement (Trefle n'a pas de bloc carrousel)",
    });
  report.fontSubstitutions = [...fonts.substituted].sort();
  report.accessibility = checkAccessibility(a11y);

  const { styles, css } = collectRules(root);
  const html = toHtml(root);
  const projectData: ProjectData = {
    assets: [],
    styles,
    pages: [{ frames: [{ component: { type: "wrapper", components: [toComponent(root)] } }] }],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(projectData) + html + css).length;
  return { projectData, html, css, report, bytes };
}
