# Penpot test fixtures

Two small `.penpot` exports (Penpot 2, format v3) used by the converter, CMS
and end-to-end tests of 015-penpot-site-import. Both are built from Penpot's
own sample library **Webdesign layouts Library (v2.1)**, published in
[penpot/penpot-files](https://github.com/penpot/penpot-files) under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — © Kaleidos and
contributors. Sections were assembled into website boards and trimmed; the only
additions are prototype links between boards and to URLs.

| Fixture              | Penpot page « Site »                        | What it exercises                                                                                                                                       |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `blog-mini.penpot`   | boards « Accueil » and « Article »          | prototype links between boards (post titles → Article), `mailto:` and external links, Google fonts (Montserrat, Outfit), 3 images, low-contrast buttons |
| `agence-mini.penpot` | boards « Contact » and « Mentions légales » | real images, grids, vectors, hostile links                                                                                                              |

## How they were made

1. Assemble a « Site » page of boards from the library's section components
   (a generator outside this repository, driven by a JSON list of sections
   and links per board).
2. Trim the export to the chosen boards with
   [`scripts/penpot-fixture.mjs`](../../scripts/penpot-fixture.mjs), which
   copies only those boards' shapes, media and typographies:

   ```bash
   node scripts/penpot-fixture.mjs <full.penpot> Site tests/fixtures/blog-mini.penpot Accueil Article
   ```

3. Check that Penpot itself re-imports the result (`import-binfile`).
