/**
 * The fixed block library (FR-002). GrapesJS components carry
 * `attributes['data-block']` = one of these values; the CMS counts them
 * server-side to enforce "exactly one lead-form block" (FR-002a).
 *
 * 012-url-page-import — `section`, `columns` and `column` are the layout
 * blocks from @trefle/grapesjs-page-import. They hold other blocks, so a
 * lead form nested inside them is still found by the tree walk below.
 * 014 adds `custom-code`.
 *
 * 016-carousel-block adds `carousel` and `carousel-slide`. A lead form must
 * stay visible without interaction, so one found inside a slide is counted
 * apart (`leadFormInCarousel`) and refused by the publish guard.
 */
export const BLOCK_TYPES = [
  "hero",
  "rich-text",
  "image",
  "call-to-action",
  "lead-form",
  "testimonial",
  "section",
  "columns",
  "column",
  // 014-custom-code-editing — the admin-only « Code personnalisé » block: a
  // placeholder the renderer swaps for its code. Counted like any block; no
  // role in the lead-form rule.
  "custom-code",
  // 016-carousel-block — the « Carrousel » block and its slides.
  "carousel",
  "carousel-slide",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export interface BlockCounts {
  total: number;
  leadForm: number;
  /** 016 — lead-form blocks found inside a carousel slide (publish is refused). */
  leadFormInCarousel: number;
  byType: Partial<Record<BlockType, number>>;
}

type GjsComponent = {
  type?: string;
  tagName?: string;
  attributes?: Record<string, unknown>;
  components?: GjsComponent[] | { models?: GjsComponent[] };
  [k: string]: unknown;
};

type GjsProjectData = {
  pages?: { frames?: { component?: GjsComponent }[] }[];
  // some GrapesJS storage shapes nest differently; be permissive
  [k: string]: unknown;
};

function blockOf(node: GjsComponent): BlockType | null {
  // Only the explicit `data-block` marker counts. Falling back to `node.type`
  // would double-count GrapesJS-native components whose type collides with a
  // block name (e.g. every `<img>` has `type: "image"`).
  const marker = node.attributes?.["data-block"];
  return typeof marker === "string" && (BLOCK_TYPES as readonly string[]).includes(marker)
    ? (marker as BlockType)
    : null;
}

function childrenOf(node: GjsComponent): GjsComponent[] {
  const c = node.components;
  if (Array.isArray(c)) return c;
  if (c && typeof c === "object" && Array.isArray((c as { models?: GjsComponent[] }).models)) {
    return (c as { models: GjsComponent[] }).models;
  }
  return [];
}

/** Walk a GrapesJS projectData tree and tally recognised blocks. */
export function countBlocks(projectData: unknown): BlockCounts {
  const counts: BlockCounts = { total: 0, leadForm: 0, leadFormInCarousel: 0, byType: {} };
  if (!projectData || typeof projectData !== "object") return counts;

  const roots: GjsComponent[] = [];
  const data = projectData as GjsProjectData;
  for (const page of data.pages ?? []) {
    for (const frame of page.frames ?? []) {
      if (frame.component) roots.push(frame.component);
    }
  }
  // fallback: a bare component tree
  if (roots.length === 0 && "components" in data) roots.push(data as GjsComponent);

  // Each entry carries whether it sits inside a carousel slide.
  const stack: [GjsComponent, boolean][] = roots.map((r) => [r, false]);
  while (stack.length) {
    const [node, inSlide] = stack.pop()!; // non-empty: checked by the loop condition
    if (!node || typeof node !== "object") continue;
    const b = blockOf(node);
    if (b) {
      counts.total += 1;
      counts.byType[b] = (counts.byType[b] ?? 0) + 1;
      if (b === "lead-form") {
        counts.leadForm += 1;
        if (inSlide) counts.leadFormInCarousel += 1;
      }
    }
    const childInSlide = inSlide || b === "carousel-slide";
    for (const child of childrenOf(node)) stack.push([child, childInSlide]);
  }
  return counts;
}
