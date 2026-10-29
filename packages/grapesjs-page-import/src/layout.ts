/**
 * Section / Columns / Column: the single source of the layout blocks' markup
 * (012-url-page-import, research R6). The GrapesJS plugin (plugin.ts) builds
 * its blocks from these definitions and the page-import serializer builds
 * imported pages from them, so a hand-built Section and an imported one are
 * the same thing.
 *
 * Only tags/attributes already in the renderer's allow-list are used
 * (`section`, `div`, `style`, `data-*`), so nothing is stripped at publish
 * time (FR-025). Columns sit side by side while the Columns block is at
 * least `COLUMNS_STACK_BELOW` wide and all stack below it — no media query
 * (FR-024). The basis `calc((600px - 100%) * 999)` is negative (→ 0, equal
 * columns on one row) when the container is wider than 600px and huge (→ one
 * column per row) when it is narrower: never a partial wrap such as 4
 * columns breaking into 3 + 1 (the earlier fixed 260px basis did at 1440px).
 *
 * No runtime import of `grapesjs` here: the serializer runs on the server.
 */

export const LAYOUT_TYPES = {
  section: "trefle-section",
  sectionInner: "trefle-section-inner",
  columns: "trefle-columns",
  column: "trefle-column",
} as const;

/** `data-block` markers (counted by @trefle/shared countBlocks). */
export const LAYOUT_MARKERS = {
  section: "section",
  columns: "columns",
  column: "column",
} as const;

/** Marker attribute of the Section's content-width element (not a block). */
export const SECTION_INNER_ATTR = "data-block-inner";

export const MIN_COLUMNS = 2;
export const MAX_COLUMNS = 4;

export type Style = Record<string, string>;

export const SECTION_STYLE: Style = { padding: "48px 24px" };
export const SECTION_INNER_STYLE: Style = { "max-width": "1120px", margin: "0 auto" };
export const COLUMNS_STYLE: Style = { display: "flex", "flex-wrap": "wrap", gap: "24px" };
/** Width of the Columns block under which its columns stack. */
export const COLUMNS_STACK_BELOW = 600;
export const COLUMN_STYLE: Style = { flex: `1 1 calc((${COLUMNS_STACK_BELOW}px - 100%) * 999)`, "min-width": "0" };

/**
 * The editor's device views — GrapesJS 0.22.16's default `deviceManager`
 * devices, which Trefle's `grapesjs.init` does not override (research R15).
 * Styles set with a device selected land under these media conditions.
 * tests/layout.test.ts fails if the installed GrapesJS ever changes them.
 */
export const DEVICE_BREAKPOINTS = {
  tablet: "(max-width: 992px)",
  mobileLandscape: "(max-width: 768px)",
  mobilePortrait: "(max-width: 480px)",
} as const;

/** Canvas preview widths of the same devices (px; desktop = full width). */
export const DEVICE_PREVIEW_WIDTHS = {
  desktop: 1440,
  tablet: 770,
  mobileLandscape: 568,
  mobilePortrait: 320,
} as const;

/** A GrapesJS component definition, as plain JSON (no grapesjs import). */
export interface ComponentJson {
  type?: string;
  tagName?: string;
  attributes?: Record<string, string>;
  style?: Style;
  components?: ComponentJson[];
  [key: string]: unknown;
}

export function columnJson(children: ComponentJson[] = []): ComponentJson {
  return {
    type: LAYOUT_TYPES.column,
    tagName: "div",
    attributes: { "data-block": LAYOUT_MARKERS.column },
    style: { ...COLUMN_STYLE },
    components: children,
  };
}

export function columnsJson(columns: ComponentJson[][]): ComponentJson {
  const count = clampColumns(columns.length);
  const cols = Array.from({ length: count }, (_, i) => columnJson(columns[i] ?? []));
  return {
    type: LAYOUT_TYPES.columns,
    tagName: "div",
    attributes: { "data-block": LAYOUT_MARKERS.columns, "data-cols": String(count) },
    style: { ...COLUMNS_STYLE },
    components: cols,
  };
}

export function sectionJson(children: ComponentJson[] = []): ComponentJson {
  return {
    type: LAYOUT_TYPES.section,
    tagName: "section",
    attributes: { "data-block": LAYOUT_MARKERS.section },
    style: { ...SECTION_STYLE },
    components: [
      {
        type: LAYOUT_TYPES.sectionInner,
        tagName: "div",
        attributes: { [SECTION_INNER_ATTR]: "" },
        style: { ...SECTION_INNER_STYLE },
        components: children,
      },
    ],
  };
}

export function clampColumns(n: number): number {
  return Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(n) || MIN_COLUMNS));
}

export function styleToString(style: Style): string {
  return Object.entries(style)
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
}
