import { z } from "zod/v4";

/**
 * Import IR — the only thing the conversion produces (012-url-page-import,
 * contracts/import-ir.md). Non-recursive by construction (structured outputs
 * reject recursive schemas): page → sections → rows → columns → leaf blocks,
 * which is also exactly the one level of columns FR-023 allows.
 *
 * No free text and no URLs: texts, links and images are referenced by the
 * ids the DOM extract assigned (`t…`, `i…`, `f…`), and the serializer puts
 * the real source text / address in. Styles are a closed list of properties;
 * the serializer re-validates every value and drops what doesn't fit.
 */

export const Ref = z.string().describe('Id from the page extract: "t12" (text or link), "i4" (image), "f1" (form)');
export const Color = z.string().describe("#rrggbb");
export const Px = z.number().int().describe("Pixels");

const Align = z.enum(["left", "center", "right"]);

export const BoxStyle = z.object({
  backgroundColor: Color.optional(),
  backgroundImage: Ref.optional().describe("Image id; sections and columns only"),
  paddingTop: Px.optional(),
  paddingRight: Px.optional(),
  paddingBottom: Px.optional(),
  paddingLeft: Px.optional(),
  borderRadius: Px.optional(),
  textAlign: Align.optional(),
});

export const TextStyle = z.object({
  color: Color.optional(),
  fontSize: Px.optional(),
  fontWeight: z.union([z.literal(400), z.literal(500), z.literal(600), z.literal(700), z.literal(800)]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textAlign: Align.optional(),
});

/** Per-device adjustments (FR-011a): tablet → (max-width: 992px), mobile → (max-width: 480px). */
export const DeviceOverride = z.object({
  box: BoxStyle.omit({ backgroundImage: true }).optional(),
  text: TextStyle.optional(),
  hidden: z.boolean().optional().describe("display:none on that device and below"),
});

export const Devices = z.object({
  tablet: DeviceOverride.optional(),
  mobile: DeviceOverride.optional(),
});

const RichTextPart = z.object({
  ref: Ref,
  as: z.enum(["h1", "h2", "h3", "h4", "p", "li-ul", "li-ol", "blockquote"]),
  style: TextStyle.optional(),
  devices: Devices.optional(),
});

export const Leaf = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("hero"),
    heading: Ref,
    headingLevel: z.union([z.literal(1), z.literal(2)]),
    text: z.array(Ref).optional(),
    cta: z.object({ label: Ref, href: Ref }).optional(),
    style: BoxStyle.optional(),
    headingStyle: TextStyle.optional(),
    textStyle: TextStyle.optional(),
    devices: Devices.optional(),
  }),
  z.object({
    kind: z.literal("rich-text"),
    parts: z.array(RichTextPart),
    style: BoxStyle.optional(),
    devices: Devices.optional(),
  }),
  z.object({
    kind: z.literal("image"),
    image: Ref,
    maxWidth: Px.optional(),
    caption: Ref.optional(),
    style: BoxStyle.optional(),
    devices: Devices.optional(),
  }),
  z.object({
    kind: z.literal("call-to-action"),
    label: Ref,
    href: Ref,
    buttonColor: Color.optional(),
    labelColor: Color.optional(),
    style: BoxStyle.optional(),
    devices: Devices.optional(),
  }),
  z.object({
    kind: z.literal("testimonial"),
    quote: Ref,
    author: Ref.optional(),
    style: BoxStyle.optional(),
    textStyle: TextStyle.optional(),
    devices: Devices.optional(),
  }),
  z.object({
    kind: z.literal("lead-form"),
    form: Ref,
  }),
]);

export const Column = z.object({
  blocks: z.array(Leaf),
  style: BoxStyle.optional(),
  devices: Devices.optional(),
});

export const Row = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("blocks"), blocks: z.array(Leaf) }),
  z.object({
    kind: z.literal("columns"),
    columns: z.array(Column).describe("2–4 columns; more in the source → several rows"),
    gap: Px.optional(),
    devices: Devices.optional(),
  }),
]);

export const Section = z.object({
  rows: z.array(Row),
  style: BoxStyle.optional(),
  contentMaxWidth: Px.optional(),
  source: z.string().describe("Short human label of the source section, for the report"),
  devices: Devices.optional(),
});

export const OMIT_REASONS = [
  "video",
  "map",
  "iframe",
  "table",
  "carousel",
  "animation",
  "widget",
  "navigation",
  "extra-form",
  "other",
] as const;

export const ImportIR = z.object({
  sections: z.array(Section),
  sourceHadMobileLayout: z
    .boolean()
    .describe("false when the source's mobile rendering is only its desktop layout shrunk"),
  simplified: z.array(z.object({ what: z.string(), how: z.string() })),
  omitted: z.array(z.object({ what: z.string(), reason: z.enum(OMIT_REASONS) })),
});

export type ImportIR = z.infer<typeof ImportIR>;
export type IRSection = z.infer<typeof Section>;
export type IRRow = z.infer<typeof Row>;
export type IRColumn = z.infer<typeof Column>;
export type IRLeaf = z.infer<typeof Leaf>;
export type IRBoxStyle = z.infer<typeof BoxStyle>;
export type IRTextStyle = z.infer<typeof TextStyle>;
export type IRDevices = z.infer<typeof Devices>;
export type IRDeviceOverride = z.infer<typeof DeviceOverride>;
