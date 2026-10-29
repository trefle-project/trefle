import type { Component, Editor, Plugin } from "grapesjs";

import { registerCarousel, type CarouselLabels } from "./carousel-plugin";

export { CAROUSEL_LABELS_FR, type CarouselLabels } from "./carousel-plugin";
import {
  LAYOUT_MARKERS,
  LAYOUT_TYPES,
  MAX_COLUMNS,
  MIN_COLUMNS,
  SECTION_INNER_ATTR,
  clampColumns,
  columnJson,
  columnsJson,
  sectionJson,
} from "./layout";

/**
 * Trefle's layout blocks for GrapesJS (012-url-page-import, User Story 3):
 * Section (a full-width band with a content-width inner element) and
 * Columns (2–4 side-by-side columns that stack on narrow screens).
 *
 * Component types are recognised by their `data-block` markers, so pages
 * saved as projectData or as plain HTML reopen as these types. Drop rules
 * live on the models (research R5): a Column only goes inside Columns, and
 * Columns never go inside a Column (one level of columns, FR-023).
 *
 * 016-carousel-block — also registers the « Carrousel » block
 * (carousel-plugin.ts).
 */
export interface TrefleLayoutOptions {
  sectionLabel?: string;
  /** `{{section}}` is replaced by `sectionLabel`. */
  sectionContentLabel?: string;
  columnsLabel?: string;
  columnsTraitLabel?: string;
  columnLabel?: string;
  /** 023-admin-i18n — the carousel's words (French by default). */
  carousel?: Partial<CarouselLabels>;
}

const dataBlock = (el: HTMLElement): string | null =>
  typeof el.getAttribute === "function" ? el.getAttribute("data-block") : null;

const isType = (c: Component | undefined, type: string) => c?.get("type") === type;

const SECTION_ICON =
  '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="2" y="5" width="20" height="14" rx="1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="6" y="9" width="12" height="6" fill="currentColor" opacity=".35"/></svg>';
const COLUMNS_ICON =
  '<svg viewBox="0 0 24 24" width="32" height="32"><rect x="2" y="5" width="6" height="14" rx="1" fill="currentColor" opacity=".35"/><rect x="9" y="5" width="6" height="14" rx="1" fill="currentColor" opacity=".35"/><rect x="16" y="5" width="6" height="14" rx="1" fill="currentColor" opacity=".35"/></svg>';

// Editor-only affordance: empty containers would otherwise collapse to zero
// height and be impossible to drop into. Injected into the canvas document,
// never into component styles, so it can't reach the exported html/css
// (same approach as the lead-form placeholder in Editor.client.tsx).
const CANVAS_CSS = `
  [data-block="column"]:empty, [${SECTION_INNER_ATTR}]:empty {
    min-height: 80px;
    outline: 1px dashed #cbd5e1;
    outline-offset: -1px;
  }
`;

export const trefleLayoutPlugin: Plugin<TrefleLayoutOptions> = (editor: Editor, opts = {}) => {
  const options = {
    sectionLabel: "Section",
    columnsLabel: "Colonnes",
    columnsTraitLabel: "Colonnes",
    sectionContentLabel: "{{section}} · contenu",
    columnLabel: "Colonne",
    ...opts,
  };
  const { Components, Blocks } = editor;

  // Idempotent: hot reload may run the plugin again on the same editor.
  if (!Components.getType(LAYOUT_TYPES.section)) {
    Components.addType(LAYOUT_TYPES.section, {
      isComponent: (el) => dataBlock(el) === LAYOUT_MARKERS.section,
      model: {
        defaults: {
          name: options.sectionLabel,
          tagName: "section",
          // Content goes into the inner element, which carries the content width.
          droppable: false,
        },
      },
    });

    Components.addType(LAYOUT_TYPES.sectionInner, {
      isComponent: (el) =>
        typeof el.hasAttribute === "function" && el.hasAttribute(SECTION_INNER_ATTR),
      model: {
        defaults: {
          name: options.sectionContentLabel.replace("{{section}}", options.sectionLabel),
          tagName: "div",
          draggable: false,
          removable: false,
          copyable: false,
        },
      },
    });

    Components.addType(LAYOUT_TYPES.columns, {
      isComponent: (el) => dataBlock(el) === LAYOUT_MARKERS.columns,
      model: {
        defaults: {
          name: options.columnsLabel,
          tagName: "div",
          droppable: (source: Component) => isType(source, LAYOUT_TYPES.column),
          cols: String(MIN_COLUMNS),
          traits: [
            {
              type: "select",
              name: "cols",
              label: options.columnsTraitLabel,
              changeProp: true,
              options: Array.from({ length: MAX_COLUMNS - MIN_COLUMNS + 1 }, (_, i) => {
                const n = String(MIN_COLUMNS + i);
                return { id: n, label: n };
              }),
            },
          ],
        },
        init(this: Component) {
          // The trait reflects the real number of columns, whatever was stored.
          syncCols(this, this.components().length || MIN_COLUMNS);
          this.on("change:cols", () => setColumnCount(this, Number(this.get("cols"))));
        },
      },
    });

    Components.addType(LAYOUT_TYPES.column, {
      isComponent: (el) => dataBlock(el) === LAYOUT_MARKERS.column,
      model: {
        defaults: {
          name: options.columnLabel,
          tagName: "div",
          draggable: (_source: Component, target: Component) => isType(target, LAYOUT_TYPES.columns),
          droppable: (source: Component) => !isType(source, LAYOUT_TYPES.columns),
        },
      },
    });
  }

  if (!Blocks.get(LAYOUT_TYPES.section)) {
    Blocks.add(LAYOUT_TYPES.section, {
      label: options.sectionLabel,
      media: SECTION_ICON,
      content: sectionJson(),
    });
    Blocks.add(LAYOUT_TYPES.columns, {
      label: options.columnsLabel,
      media: COLUMNS_ICON,
      content: columnsJson([[], []]),
    });
  }

  editor.on("load", () => {
    const doc = editor.Canvas.getDocument();
    if (!doc || doc.getElementById("trefle-layout-canvas-css")) return;
    const style = doc.createElement("style");
    style.id = "trefle-layout-canvas-css";
    style.textContent = CANVAS_CSS;
    doc.head.appendChild(style);
  });

  registerCarousel(editor, options.carousel);
};

/**
 * Changes a Columns component to `wanted` columns (clamped to 2–4). Adding
 * appends empty columns; removing appends the removed columns' blocks to the
 * last remaining column first, so nothing is lost (FR-023).
 */
export function setColumnCount(columns: Component, wanted: number): void {
  const count = clampColumns(wanted);
  const children = columns.components();
  const current = children.length;
  if (count > current) {
    for (let i = current; i < count; i++) columns.append(columnJson());
  } else if (count < current) {
    const keep = children.at(count - 1);
    for (let i = current - 1; i >= count; i--) {
      const removed = children.at(i);
      [...removed.components().models].forEach((block) => block.move(keep, {}));
      removed.remove();
    }
  }
  columns.addAttributes({ "data-cols": String(count) });
  syncCols(columns, count);
}

/**
 * Sets `cols` without re-running `setColumnCount`, and the trait's own value
 * with it: GrapesJS attaches the trait (reading the type's default) before
 * `init` runs, and the settings panel only writes a value that differs from
 * the trait's — a stale "2" made choosing 2 columns after loading 3 a no-op.
 */
function syncCols(columns: Component, count: number): void {
  const value = String(count);
  if (columns.get("cols") !== value) columns.set("cols", value, { silent: true });
  const trait = columns.getTrait("cols");
  if (trait && trait.get("value") !== value) trait.set("value", value, { silent: true });
}

export default trefleLayoutPlugin;
