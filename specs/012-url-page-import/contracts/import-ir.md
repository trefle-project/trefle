# Contract: Import IR (AI output schema)

The only thing the AI produces. Defined once as a zod (`zod/v4`) schema in
`@trefle/grapesjs-page-import/ir`, sent as `output_config.format` via
`betaZodOutputFormat` on `client.beta.messages.create` (beta for server-side
fallbacks), parsed with that format's own `parse` once `stop_reason` is
`end_turn`, then turned into GrapesJS
content by `serializeImport`. **Non-recursive by construction** (structured
outputs reject recursive schemas): page → sections → rows → columns → blocks.

## Principles

1. **No free text, no URLs.** Texts and images are referenced by the ids the
   DOM extract assigned (`t…`, `i…`, `f…`). The serializer inserts the real
   source text (verbatim, safe inline markup only) and the Media URL.
2. **Only library blocks.** `kind` is a closed enum of the library's block
   types. Anything else the model saw goes in `omitted` / `simplified`.
3. **Only whitelisted style properties**, each with a constrained format,
   re-validated by the serializer (invalid values dropped, never passed
   through).

## Schema (TypeScript view of the zod schema)

```ts
type Ref = string;                                   // "t12" | "i4" | "f1"
type Color = string;                                 // /^#[0-9a-f]{6}$/i — serializer rejects anything else
type Px = number;                                    // integer, clamped 0–400 by the serializer

type BoxStyle = {
  backgroundColor?: Color;
  backgroundImage?: Ref;                             // image id → Media URL, sections and columns only (a card whose text sits on a photo)
  paddingTop?: Px; paddingRight?: Px; paddingBottom?: Px; paddingLeft?: Px;
  borderRadius?: Px;
  textAlign?: "left" | "center" | "right";
};

type TextStyle = {
  color?: Color;
  fontSize?: Px;                                     // clamped 10–96
  fontWeight?: 400 | 500 | 600 | 700 | 800;
  fontStyle?: "normal" | "italic";
  textAlign?: "left" | "center" | "right";
};

// Per-device adjustments (FR-011a). Written as the editor's own device-view
// styles: tablet → (max-width: 992px), mobile → (max-width: 480px).
type DeviceOverride = {
  box?: Omit<BoxStyle, "backgroundImage">;
  text?: TextStyle;
  hidden?: boolean;                                  // display:none on that device and below
};
type Devices = { tablet?: DeviceOverride; mobile?: DeviceOverride };

type Leaf =
  | { kind: "hero"; heading: Ref; headingLevel: 1 | 2; text?: Ref[]; cta?: { label: Ref; href: Ref }; style?: BoxStyle; headingStyle?: TextStyle; textStyle?: TextStyle; devices?: Devices }
  | { kind: "rich-text"; parts: { ref: Ref; as: "h1" | "h2" | "h3" | "h4" | "p" | "li-ul" | "li-ol" | "blockquote"; style?: TextStyle; devices?: Devices }[]; style?: BoxStyle; devices?: Devices }
  | { kind: "image"; image: Ref; maxWidth?: Px; caption?: Ref; style?: BoxStyle; devices?: Devices }
  | { kind: "call-to-action"; label: Ref; href: Ref; buttonColor?: Color; labelColor?: Color; style?: BoxStyle; devices?: Devices }
  | { kind: "testimonial"; quote: Ref; author?: Ref; style?: BoxStyle; textStyle?: TextStyle; devices?: Devices }
  | { kind: "lead-form"; form: Ref };                // f-id of the source form; serializer enforces page-type rules

type Column = { blocks: Leaf[]; style?: BoxStyle; devices?: Devices };
type Row =
  | { kind: "blocks"; blocks: Leaf[] }                              // full-width run of blocks
  | { kind: "columns"; columns: Column[]; gap?: Px; devices?: Devices };   // 2–4 columns; >4 in source → several rows

type Section = { rows: Row[]; style?: BoxStyle; contentMaxWidth?: Px; source: string; devices?: Devices };  // source: short human label for the report

type ImportIR = {
  sections: Section[];
  sourceHadMobileLayout: boolean;                    // false when the source's mobile rendering is just its desktop one shrunk
  simplified: { what: string; how: string }[];
  omitted: { what: string; reason: "video" | "map" | "iframe" | "table" | "carousel" | "animation" | "widget" | "navigation" | "extra-form" | "other" }[];
};
```

`href` refs point at link entries of the DOM extract (`t…` ids whose tag is
`a`), so link targets are the source's own (absolutised) addresses.

## Wire format (what the model writes)

The schema above, sent as is, is refused by the API ("The compiled grammar
is too large": 40+ optional style fields nested per device). The model
therefore writes a compact variant (`@trefle/grapesjs-page-import/ir-wire`,
`WireIR`) with the same structure and refs, where each element's styles are
one optional CSS-like string — `css` (box), and `headingCss` / `textCss` /
`buttonCss` where relevant — e.g.
`"background-color:#ecfdf5; padding:80px 24px; @mobile{padding:40px 16px; display:none}"`.
`fromWire` converts it into the structured IR above, keeping only the
allowed properties with valid values (`#rgb`/`#rrggbb`, px integers, known
keywords); `background-image` is kept on sections and columns only (a banner photo
put on a hero is lifted to its section); `max-width` gives a section's content
width or an image's width; `display:none` in `@tablet`/`@mobile` gives
`hidden`. The result is validated against `ImportIR`. A test pins the
number of optional properties of the wire schema (≤ 17).

## Serializer guarantees (tested)

- Device overrides are emitted only as GrapesJS device-view styles: rules on
  the component's own id selector under `(max-width: 992px)` (tablet) and
  `(max-width: 480px)` (mobile), stored in `projectData.styles` with
  `mediaText`/`atRuleType: "media"` and mirrored in the exported `css`. The
  breakpoints come from one constant equal to the installed GrapesJS default
  device config (asserted by a test). Nothing is emitted for Mobile landscape.
- A device override identical to the value it would inherit is dropped (no
  noise in the editor's device view).

- Output contains only tags/attributes in `@trefle/shared` `ALLOWED_TAGS` /
  `ALLOWED_ATTR`; sanitising the output is a no-op (FR-008).
- Every text in the output is byte-identical to a DOM-extract text (after the
  extract's own safe-markup filter) — no generated wording.
- Unknown refs → element dropped and listed in `report.omitted` with reason
  `other`; never a crash.
- Columns > 4 are split into rows of ≤ 4; Columns inside a Column cannot be
  expressed (schema) — FR-023.
- Lead form: `subscription` → the first `lead-form` leaf is kept (preferring
  one whose source form has an email field, Story 4 AS-2), others become
  `omitted: extra-form`; `free`/`confirmation` → all dropped and reported
  (FR-017). The kept placeholder uses the exact lead-form block definition
  from `GJS_BLOCKS` (id `form`, `droppable: false`).
- Source form fields map to supported field types
  (`email`, `text`, `textarea`, `select`, `checkbox`, `tel`, `radio`,
  `number`, `date` — the product's full list, `apps/cms/src/fields/form.ts`),
  with `select`/`radio` options copied from the source; unsupported ones listed in
  `report.formFieldsUnmapped`.
- A text that is one link as a whole (a card title) gets a `#<id> a`
  rule (`color:inherit; text-decoration:none`, GrapesJS `selectorsAdd`), so
  it reads like the source's text; links inside a sentence keep the default
  link look.
- Image refs that fail download → the Image block's standard placeholder SVG
  (FR-014); background images that fail → background dropped, colour kept.
