# Contract: legal pages without empty headings (US3)

`buildLegal` (`apps/cms/src/lib/legal/build.ts`) output, after placeholders
are filled:

- A `heading` node is removed when, before the next heading of the same or a
  higher level (or the end), there is no node other than headings of a
  deeper level that are themselves removed.
- Non-heading content (paragraph, list, quote, the suppliers list, the
  domain's extra paragraph) under a heading keeps it.
- The page title (rendered by the renderer outside the text) is untouched.
- Version hash computed on the final HTML (021) → affected domains get one
  new archived version.

## Tests

- h2 with all paragraphs removed → h2 removed; h2 with one paragraph kept →
  kept.
- h2 › h3 (empty) › h3 (filled) → h2 and the filled h3 kept, empty h3
  removed.
- h2 › h3 (empty) › h3 (empty) → all three removed.
- Production regression: the default French texts with an empty owner →
  no « Qui est responsable de vos données » / « Éditeur du site » heading.
