import type { Component, Editor, ToolbarButtonProps } from "grapesjs";

import {
  CAROUSEL_AUTOPLAY_RANGE,
  CAROUSEL_DEFAULT_LABEL,
  CAROUSEL_MARKER,
  CAROUSEL_MAX_SLIDES,
  CAROUSEL_SLIDE_MARKER,
  parseCarouselSettings,
} from "@trefle/shared";

import { CAROUSEL_TYPES, carouselJson, slideJson } from "./carousel";

/**
 * 016-carousel-block — the « Carrousel » block in the editor
 * (specs/016-carousel-block/contracts/editor.md, research R10). Registered by
 * `trefleLayoutPlugin`.
 *
 * The canvas shows one slide of each carousel at a time. Which one is view
 * state (`active`, never saved): canvas-only `data-tf-active` /
 * `data-tf-label` attributes, re-applied whenever GrapesJS rewrites an
 * element's attributes, so they never reach the model, `getHtml()` or
 * `projectData` (same approach as the custom-code block). Slides are shown,
 * added and reordered with toolbar commands — dragging has no visible target
 * when only one slide is on screen.
 */
const SLIDE_SELECTOR = `[data-block="${CAROUSEL_SLIDE_MARKER}"]`;
const CAROUSEL_SELECTOR = `[data-block="${CAROUSEL_MARKER}"]`;

export const CAROUSEL_COMMANDS = {
  prev: "trefle-carousel:prev",
  next: "trefle-carousel:next",
  add: "trefle-carousel:add",
  movePrev: "trefle-carousel:move-prev",
  moveNext: "trefle-carousel:move-next",
} as const;

export const CAROUSEL_LIMIT_MESSAGE = `${CAROUSEL_MAX_SLIDES} diapositives maximum`;

const blockOf = (c: Component | undefined): string | undefined => c?.getAttributes?.()["data-block"];
const isSlide = (c: Component | undefined) => blockOf(c) === CAROUSEL_SLIDE_MARKER;
const isCarousel = (c: Component | undefined) => blockOf(c) === CAROUSEL_MARKER;
// `closestType` walks the models, so it also works before the canvas renders
// (`closest` queries the DOM).
/** `c` itself when it is a slide, else the slide holding it. */
const slideOf = (c: Component | undefined) => (isSlide(c) ? c : c?.closestType(CAROUSEL_TYPES.slide));
/** `c` itself when it is a carousel, else the carousel holding it. */
const carouselAround = (c: Component | undefined) => (isCarousel(c) ? c : c?.closestType(CAROUSEL_TYPES.carousel));
const slidesOf = (carousel: Component) => carousel.components().models as Component[];

/**
 * The editor's words (023-admin-i18n): French by default, the admin passes
 * the member's language. `{{n}}` / `{{count}}` in `slidePosition`.
 */
export const CAROUSEL_LABELS_FR = {
  carousel: "Carrousel",
  slide: "Diapositive",
  slidePosition: "Diapositive {{n}} / {{count}}",
  dropHere: "Déposez des blocs ici",
  prevSlide: "Diapositive précédente",
  nextSlide: "Diapositive suivante",
  addSlide: "Ajouter une diapositive",
  movePrev: "Déplacer avant",
  moveNext: "Déplacer après",
  carouselName: "Nom du carrousel",
  slidesVisible: "Diapositives visibles",
  autoplay: "Défilement automatique",
  interval: "Intervalle (secondes)",
  arrows: "Afficher les flèches",
  dots: "Afficher les points",
  blockHint: "Glisser dans la page, ou cliquer pour l'ajouter après le bloc sélectionné",
};
export type CarouselLabels = typeof CAROUSEL_LABELS_FR;

// Editor-only look, injected into the canvas document (never component styles).
// Slides are hidden only once a carousel is painted (`data-tf-label`), so a
// carousel never shows nothing.
const canvasCss = (labels: CarouselLabels) => `
  ${CAROUSEL_SELECTOR} { outline: 1px dashed #94a3b8; outline-offset: -1px; }
  ${CAROUSEL_SELECTOR}[data-tf-label]::before {
    content: attr(data-tf-label);
    display: block;
    padding: 4px 8px;
    font: 12px system-ui, sans-serif;
    color: #475569;
    background: #f1f5f9;
  }
  ${CAROUSEL_SELECTOR}[data-tf-label] > ${SLIDE_SELECTOR}:not([data-tf-active]) { display: none; }
  ${SLIDE_SELECTOR}:empty { min-height: 120px; outline: 1px dashed #cbd5e1; outline-offset: -1px; }
  ${SLIDE_SELECTOR}:empty::before {
    content: ${JSON.stringify(labels.dropHere)};
    display: block;
    padding: 48px 0;
    font: 13px system-ui, sans-serif;
    color: #64748b;
    text-align: center;
  }
`;

const ICON =
  '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="5" y="5" width="14" height="11" rx="1" fill="currentColor" opacity=".35"/><path d="M3 8v5M21 8v5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="9" cy="19.5" r="1" fill="currentColor"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/><circle cx="15" cy="19.5" r="1" fill="currentColor"/></svg>';

const svg = (d: string) =>
  `<svg viewBox="0 0 24 24" width="14" height="14" style="vertical-align:middle"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const tool = (command: string, title: string, d: string): ToolbarButtonProps => ({ command, label: svg(d), attributes: { title } });

const carouselTools = (labels: CarouselLabels) => [
  tool(CAROUSEL_COMMANDS.prev, labels.prevSlide, "M15 5l-7 7 7 7"),
  tool(CAROUSEL_COMMANDS.next, labels.nextSlide, "M9 5l7 7-7 7"),
  tool(CAROUSEL_COMMANDS.add, labels.addSlide, "M12 5v14M5 12h14"),
];
const slideTools = (labels: CarouselLabels) => [
  tool(CAROUSEL_COMMANDS.movePrev, labels.movePrev, "M19 12H5M11 6l-6 6 6 6"),
  tool(CAROUSEL_COMMANDS.moveNext, labels.moveNext, "M5 12h14M13 6l6 6-6 6"),
];

/**
 * Settings panel (contracts/editor.md, Traits). The traits edit model
 * properties (`changeProp`); `writeSettings` turns them into the carousel's
 * attributes — the markup is the only source of truth (contracts/markup.md),
 * with every default written as the attribute's absence.
 */
const SETTINGS = ["carouselLabel", "perView", "autoplay", "interval", "arrows", "dots"] as const;
const { min: MIN_INTERVAL, max: MAX_INTERVAL, default: DEFAULT_INTERVAL } = CAROUSEL_AUTOPLAY_RANGE;
const traits = (labels: CarouselLabels) => [
  { type: "text", name: "carouselLabel", label: labels.carouselName, placeholder: CAROUSEL_DEFAULT_LABEL, changeProp: true },
  {
    type: "select",
    name: "perView",
    label: labels.slidesVisible,
    changeProp: true,
    options: ["1", "2", "3"].map((id) => ({ id, label: id })),
  },
  { type: "checkbox", name: "autoplay", label: labels.autoplay, changeProp: true },
  { type: "number", name: "interval", label: labels.interval, min: MIN_INTERVAL, max: MAX_INTERVAL, step: 1, changeProp: true },
  { type: "checkbox", name: "arrows", label: labels.arrows, changeProp: true },
  { type: "checkbox", name: "dots", label: labels.dots, changeProp: true },
];

/** The settings read back from the attributes (into props and traits alike). */
function readSettings(c: Component): void {
  const attributes = c.getAttributes() as Record<string, string | undefined>;
  const s = parseCarouselSettings(attributes);
  const values: Record<(typeof SETTINGS)[number], unknown> = {
    carouselLabel: attributes["aria-label"]?.trim() ?? "",
    perView: String(s.perView),
    autoplay: s.autoplay !== null,
    interval: s.autoplay ?? DEFAULT_INTERVAL,
    arrows: s.arrows,
    dots: s.dots,
  };
  for (const name of SETTINGS) {
    c.set(name, values[name], { silent: true });
    // The panel only writes values that differ from the trait's own (see
    // syncCols in plugin.ts): keep it in step.
    c.getTrait(name)?.set("value", values[name], { silent: true });
  }
}

function writeSettings(c: Component): void {
  const attributes = { ...c.getAttributes() } as Record<string, string>;
  const put = (name: string, value: string | undefined) => {
    if (value === undefined) delete attributes[name];
    else attributes[name] = value;
  };
  const label = String(c.get("carouselLabel") ?? "").trim();
  put("aria-label", label && label !== CAROUSEL_DEFAULT_LABEL ? label : undefined);
  const perView = String(c.get("perView") ?? "1");
  put("data-per-view", perView !== "1" ? perView : undefined);
  const interval = Math.round(Number(c.get("interval")));
  const seconds = Number.isFinite(interval) ? Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, interval)) : DEFAULT_INTERVAL;
  put("data-autoplay", c.get("autoplay") ? String(seconds) : undefined);
  put("data-arrows", c.get("arrows") === false ? "false" : undefined);
  put("data-dots", c.get("dots") === false ? "false" : undefined);
  c.setAttributes(attributes);
}

/** GrapesJS's own toolbar for `c` (built from its current flags), plus `extra`. */
function setToolbar(c: Component, extra: ToolbarButtonProps[]): void {
  c.set("toolbar", undefined, { silent: true });
  c.initToolbar();
  c.set("toolbar", [...((c.get("toolbar") as ToolbarButtonProps[] | undefined) ?? []), ...extra]);
}

export function registerCarousel(editor: Editor, custom: Partial<CarouselLabels> = {}): void {
  const { Components, Blocks, Commands } = editor;
  if (Components.getType(CAROUSEL_TYPES.carousel)) return; // idempotent (hot reload)
  const labels = { ...CAROUSEL_LABELS_FR, ...custom };
  const CAROUSEL_TOOLS = carouselTools(labels);
  const SLIDE_TOOLS = slideTools(labels);

  const active = new WeakMap<Component, number>();

  /** Re-applies the canvas-only attributes of `carousel` (no-op headless). */
  const paint = (carousel: Component) => {
    const slides = slidesOf(carousel);
    const index = Math.max(0, Math.min(active.get(carousel) ?? 0, slides.length - 1));
    active.set(carousel, index);
    slides.forEach((slide, i) => slide.getEl()?.toggleAttribute("data-tf-active", i === index));
    carousel.getEl()?.setAttribute(
      "data-tf-label",
      labels.slidePosition.replace("{{n}}", String(index + 1)).replace("{{count}}", String(slides.length)),
    );
  };
  /** Shows slide `index` (wrapping around). */
  const show = (carousel: Component, index: number) => {
    const n = slidesOf(carousel).length;
    if (!n) return;
    active.set(carousel, ((index % n) + n) % n);
    paint(carousel);
  };
  /** At most 12 slides, never fewer than 1: the slides' own delete/duplicate. */
  const syncLimits = (carousel: Component) => {
    const slides = slidesOf(carousel);
    for (const slide of slides) {
      slide.set({ removable: slides.length > 1, copyable: slides.length < CAROUSEL_MAX_SLIDES });
      setToolbar(slide, SLIDE_TOOLS);
    }
  };

  // GrapesJS rewrites an element's attributes from its model on every change,
  // wiping the canvas-only markers: re-paint right after (customCodeBlock.ts).
  const baseUpdateAttributes = (Components.getType("default")!.view.prototype as { updateAttributes: () => void }) // "default" always exists
    .updateAttributes;
  type ViewThis = { model: Component };
  const carouselOf = (c: Component) => (isCarousel(c) ? c : isCarousel(c.parent()) ? c.parent() : undefined);
  const repaintView = {
    onRender(this: ViewThis) {
      const carousel = carouselOf(this.model);
      if (carousel) paint(carousel);
    },
    updateAttributes(this: ViewThis) {
      baseUpdateAttributes.call(this);
      const carousel = carouselOf(this.model);
      if (carousel) paint(carousel);
    },
  };

  Components.addType(CAROUSEL_TYPES.carousel, {
    isComponent: (el: HTMLElement) => typeof el.getAttribute === "function" && el.getAttribute("data-block") === CAROUSEL_MARKER,
    model: {
      defaults: {
        name: labels.carousel,
        tagName: "section",
        attributes: { "data-block": CAROUSEL_MARKER },
        droppable: (source: Component) => isSlide(source),
        // Never inside a slide (FR-007).
        draggable: (_self: Component, target: Component) => !slideOf(target),
        traits: traits(labels),
      },
      init(this: Component) {
        readSettings(this);
        this.on(SETTINGS.map((name) => `change:${name}`).join(" "), () => writeSettings(this));
        setToolbar(this, CAROUSEL_TOOLS);
        syncLimits(this);
        this.listenTo(this.components(), "add remove reset", () => {
          syncLimits(this);
          setTimeout(() => paint(this)); // new slides render after the event
        });
      },
    },
    view: repaintView,
  });

  Components.addType(CAROUSEL_TYPES.slide, {
    isComponent: (el: HTMLElement) =>
      typeof el.getAttribute === "function" && el.getAttribute("data-block") === CAROUSEL_SLIDE_MARKER,
    model: {
      defaults: {
        name: labels.slide,
        tagName: "div",
        attributes: { "data-block": CAROUSEL_SLIDE_MARKER },
        draggable: (_self: Component, target: Component) => isCarousel(target),
        // No lead form (it must stay visible) and no carousel in a carousel (FR-007).
        droppable: (source: Component) => blockOf(source) !== "lead-form" && !isCarousel(source),
      },
    },
    view: repaintView,
  });

  const selected = () => editor.getSelected() as Component | undefined;
  const selectedCarousel = () => carouselAround(selected());

  Commands.add(CAROUSEL_COMMANDS.prev, {
    run: () => {
      const c = selectedCarousel();
      if (c) show(c, (active.get(c) ?? 0) - 1);
    },
  });
  Commands.add(CAROUSEL_COMMANDS.next, {
    run: () => {
      const c = selectedCarousel();
      if (c) show(c, (active.get(c) ?? 0) + 1);
    },
  });
  Commands.add(CAROUSEL_COMMANDS.add, {
    run: () => {
      const c = selectedCarousel();
      if (!c) return;
      if (slidesOf(c).length >= CAROUSEL_MAX_SLIDES) {
        window.alert(CAROUSEL_LIMIT_MESSAGE);
        return;
      }
      const at = (active.get(c) ?? 0) + 1;
      c.append(slideJson(), { at });
      show(c, at);
    },
  });
  const move = (step: -1 | 1) => () => {
    const slide = slideOf(selected());
    const carousel = slide?.parent();
    if (!slide || !carousel) return;
    const to = slide.index() + step;
    if (to < 0 || to >= slidesOf(carousel).length) return;
    // `at` counts positions before the slide leaves its place.
    slide.move(carousel, { at: step > 0 ? to + 1 : to });
    show(carousel, slide.index());
    editor.select(slide);
  };
  Commands.add(CAROUSEL_COMMANDS.movePrev, { run: move(-1) });
  Commands.add(CAROUSEL_COMMANDS.moveNext, { run: move(1) });

  // Selecting something in a hidden slide (layer manager, undo, a duplicate
  // just pasted) brings that slide into view (FR-005).
  editor.on("component:selected", (c: Component) => {
    const slide = slideOf(c);
    const carousel = slide?.parent();
    if (slide && isCarousel(carousel)) show(carousel!, slide.index()); // isCarousel(carousel) ⇒ defined
  });

  Blocks.add(CAROUSEL_TYPES.carousel, {
    label: labels.carousel,
    media: ICON,
    attributes: { title: labels.blockHint },
    content: carouselJson(),
    // Click to add, as the « Code personnalisé » block does (apps/cms
    // customCodeBlock.ts): after the block holding the selection, at the end
    // of a selected column, else at the end of the page — never in a slide:
    // a selection inside a carousel adds after that carousel.
    onClick: (_block: unknown, ed: Editor) => {
      let anchor = ed.getSelected() as Component | undefined;
      anchor = carouselAround(anchor) ?? anchor;
      while (anchor && !blockOf(anchor)) anchor = anchor.parent();
      const container = anchor?.parent();
      const [added] =
        anchor && blockOf(anchor) === "column"
          ? anchor.append(carouselJson())
          : anchor && container
            ? container.append(carouselJson(), { at: anchor.index() + 1 })
            : ed.getWrapper()!.append(carouselJson()); // the wrapper exists once the editor is up
      if (added) ed.select(added);
    },
  });

  editor.on("load", () => {
    const doc = editor.Canvas.getDocument();
    if (!doc || doc.getElementById("trefle-carousel-canvas-css")) return;
    const style = doc.createElement("style");
    style.id = "trefle-carousel-canvas-css";
    style.textContent = canvasCss(labels);
    doc.head.appendChild(style);
  });
}
