# Contract: Penpot → GrapesJS conversion

Module `@trefle/grapesjs-page-import/penpot`. Pure functions, no I/O: zip
bytes in, page content out. The CMS job supplies the side effects (Media,
fonts) through callbacks resolved **before** the build.

## API (TypeScript view)

```ts
/** Central-directory checks + parse. Throws PenpotFileError(code) — codes of site-import-api.md. */
function readPenpotFile(bytes: Uint8Array, limits?: Partial<PenpotLimits>): PenpotFile;

type PenpotFile = {
  name: string;
  pages: PenpotPage[];                        // in Penpot's page order
  media(id: string): { bytes: Uint8Array; mtype: string; width: number; height: number } | undefined;
  thumbnail(pageId: string, boardId: string): Uint8Array | undefined;
};
type PenpotPage = { id: string; name: string; boards: BoardSummary[] };
type BoardSummary = { id: string; name: string; width: number; height: number; proposedPath: string };

/** What the page needs from outside, collected before building (job steps fonts + images). */
function boardNeeds(file: PenpotFile, pageId: string, boardIds: string[]): {
  /** googleFamily: Google Fonts family name ("Source Sans 3" for Penpot's default), null when not a Google font. */
  fonts: { family: string; googleFamily: string | null; weight: number; style: "normal" | "italic" }[];
  images: { mediaId: string; displayWidth: number; name: string }[];
};

function convertBoard(file: PenpotFile, pageId: string, boardId: string, ctx: {
  paths: Record<string, string>;              // ticked boardId → page path (links, P10)
  images: Record<string, { url: string; alt: string; altPending: boolean } | null>;  // mediaId → stored Media, null = failed
  fonts: Set<string>;                         // families available on the domain after the fonts step; others → generic fallback
  fileName: string;                           // shown in the report instead of 012's source URL
}): { projectData: ProjectData; html: string; css: string; report: ImportReport; bytes: number };
```

`ImportReport`, `ProjectData` and the a11y helpers are the ones of
`serialize.ts` / `a11y.ts` (012). `report.finalUrl` holds the file name;
`report.sourceHadMobileLayout` is `false`.

## Guarantees (each has a test)

1. **Allow-list**: output tags and attributes are within `@trefle/shared`
   `ALLOWED_TAGS` / `ALLOWED_ATTR`; sanitising `html` with `SANITIZE_CONFIG`
   is a no-op.
2. **Verbatim texts**: every text node equals the concatenated Penpot text
   leaves of its paragraph, HTML-escaped. Nothing is generated.
3. **Order**: DOM children = Penpot `shapes` reversed (research P4) for
   flex, free frames and groups; grid children in cell order (row, then
   column). Inside free containers, `z-index` keeps Penpot's painting order.
4. **Round trip**: loading `projectData` into GrapesJS 0.22.16 (jsdom) and
   exporting gives back `html` and `css` equivalent to the returned ones (012
   round-trip helper).
5. **Editable**: no component is `locked`, `copyable: false` or
   `removable: false`; every text is a `text` component; every image is an
   `image` component.
6. **Responsive**: every rule of research P5 is emitted as device-view styles
   only (`(max-width: 992px)`, `(max-width: 480px)`), with the breakpoint
   constants shared with 012.
7. **Free layout**: content inside a frame or group without layout uses only
   `cqw` lengths below that container (research P6), and the board or section
   is listed in `report.simplified`.
8. **Links**: only ticked boards' paths and `http(s):` / `mailto:` / `tel:`
   URLs appear in `href` (`SAFE_HREF_RE`); every dropped interaction is listed
   in `report.omitted` (`reason: "interaction"`); no `a` inside an `a`.
9. **Headings**: exactly one `h1` per page when the board has any text;
   heading levels never skip downwards by more than one (`a11y.ts` check
   passes on the reference set).
10. **Fonts**: `css` contains no `@font-face` and no font URL (domain fonts
    are served by the page shell, research P8). Every `font-family` is
    either a family of `ctx.fonts`, followed by a generic fallback, or a
    generic stack; every family not in `ctx.fonts` is listed in
    `report.fontSubstitutions`.
11. **Images**: each `fillImage` maps to its stored Media URL. A failed one
    becomes the Image block's standard placeholder and is listed in
    `report.failedImages` (012 FR-014 rule).
12. **Hidden**: no hidden shape, or anything inside one, appears in the
    output.
13. **Size**: `bytes` = UTF-8 length of `JSON.stringify(projectData) + html +
    css`. The job fails the import with `page-too-large` when it exceeds
    450 KB.
14. **Robustness**: unknown shape types, unknown fields and missing
    references are skipped and reported (`omitted`, reason `other`). They
    never cause a throw. Malformed numbers are clamped (sizes 0–20 000 px,
    font size 1–400 px).
