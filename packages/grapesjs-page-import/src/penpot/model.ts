/**
 * The subset of Penpot's exported shape JSON the converter reads
 * (015-penpot-site-import, research P1/P4–P10). Penpot 2 « binfile v3 »
 * writes one camelCase JSON file per shape. Everything is optional except
 * what every shape carries: unknown or missing fields are skipped, never
 * trusted (contracts/penpot-conversion.md guarantee 14).
 */

export const ROOT_ID = "00000000-0000-0000-0000-000000000000";

export type ShapeType =
  "frame" | "group" | "rect" | "circle" | "text" | "path" | "bool" | "image" | "svg-raw" | string;

export type Rect = { x: number; y: number; width: number; height: number };

export type Gradient = {
  type: "linear" | "radial";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  width?: number;
  stops: { color: string; offset: number; opacity?: number }[];
};

export type Fill = {
  fillColor?: string;
  fillOpacity?: number;
  fillColorGradient?: Gradient;
  fillImage?: {
    id: string;
    width?: number;
    height?: number;
    mtype?: string;
    keepAspectRatio?: boolean;
  };
};

export type Stroke = {
  strokeColor?: string;
  strokeOpacity?: number;
  /** Older files use `color` / `opacity`. */
  color?: string;
  opacity?: number;
  strokeWidth?: number;
  strokeStyle?: "solid" | "dashed" | "dotted" | "mixed" | "none";
  strokeAlignment?: "inner" | "center" | "outer";
  strokeCapStart?: string;
  strokeCapEnd?: string;
  strokeColorGradient?: Gradient;
};

export type Shadow = {
  style?: "drop-shadow" | "inner-shadow";
  offsetX?: number;
  offsetY?: number;
  blur?: number;
  spread?: number;
  hidden?: boolean;
  color?: { color?: string; opacity?: number };
};

export type TrackType = "flex" | "fixed" | "percent" | "auto";
export type Track = { type: TrackType; value?: number };

export type GridCell = {
  id?: string;
  row?: number;
  column?: number;
  rowSpan?: number;
  columnSpan?: number;
  position?: "auto" | "manual" | "area";
  alignSelf?: string;
  justifySelf?: string;
  shapes?: string[];
};

export type Interaction = {
  eventType?: string;
  actionType?: string;
  destination?: string | null;
  url?: string;
  preserveScroll?: boolean;
};

/** A text leaf or paragraph: the style keys Penpot repeats at both levels. */
export type TextStyle = {
  fontId?: string;
  fontFamily?: string;
  fontSize?: string | number;
  fontWeight?: string | number;
  fontStyle?: string;
  fontVariantId?: string;
  lineHeight?: string | number;
  letterSpacing?: string | number;
  textTransform?: string;
  textDecoration?: string;
  textAlign?: string;
  typographyRefId?: string | null;
  fills?: Fill[];
};

export type TextNode = TextStyle & {
  type?: "root" | "paragraph-set" | "paragraph" | string;
  text?: string;
  verticalAlign?: string;
  children?: TextNode[];
};

/** `svg-raw` content: an XML-like element tree. */
export type SvgRawNode = {
  tag?: string;
  attrs?: Record<string, unknown>;
  content?: (SvgRawNode | string)[];
};

export type Shape = {
  id: string;
  type: ShapeType;
  name: string;
  parentId?: string;
  frameId?: string;
  shapes?: string[];
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  selrect?: Rect & { x1?: number; y1?: number; x2?: number; y2?: number };
  rotation?: number;
  hidden?: boolean;
  opacity?: number;
  blendMode?: string;
  maskedGroup?: boolean;
  fills?: Fill[];
  strokes?: Stroke[];
  shadow?: Shadow[];
  blur?: { type?: string; value?: number; hidden?: boolean };
  r1?: number;
  r2?: number;
  r3?: number;
  r4?: number;
  rx?: number;
  // Layout container
  layout?: "flex" | "grid" | null;
  layoutFlexDir?: "row" | "row-reverse" | "column" | "column-reverse";
  layoutWrapType?: "wrap" | "nowrap";
  layoutGap?: { rowGap?: number; columnGap?: number };
  layoutPadding?: { p1?: number; p2?: number; p3?: number; p4?: number };
  layoutJustifyContent?: string;
  layoutJustifyItems?: string;
  layoutAlignItems?: string;
  layoutAlignContent?: string;
  layoutGridDir?: "row" | "column";
  layoutGridColumns?: Track[];
  layoutGridRows?: Track[];
  layoutGridCells?: Record<string, GridCell>;
  // Layout item
  layoutItemHSizing?: "fix" | "fill" | "auto";
  layoutItemVSizing?: "fix" | "fill" | "auto";
  layoutItemMargin?: { m1?: number; m2?: number; m3?: number; m4?: number };
  layoutItemAbsolute?: boolean;
  layoutItemZIndex?: number;
  layoutItemMinW?: number;
  layoutItemMaxW?: number;
  layoutItemMinH?: number;
  layoutItemMaxH?: number;
  showContent?: boolean;
  // Text / vectors
  /** Text tree, SVG path string (or, in older files, a list of path segments), or svg-raw tree. */
  content?: TextNode | string | SvgRawNode | unknown[];
  growType?: "fixed" | "auto-width" | "auto-height";
  interactions?: Interaction[];
  svgAttrs?: Record<string, unknown>;
  metadata?: { id?: string; width?: number; height?: number; mtype?: string };
  // Components (read like any other shape, research P11)
  componentId?: string;
  shapeRef?: string;
};

export type Typography = { id: string; name: string; path?: string; fontSize?: string | number };

export type MediaEntry = {
  id: string;
  name?: string;
  mtype: string;
  width: number;
  height: number;
  mediaId: string;
};
