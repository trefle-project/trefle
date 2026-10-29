# 015 — Fidelity evaluation (T048), 2026-10-07

The 4 reference files of `../penpot/references/` (19 boards), imported by the
real `site-import` job on the dev stack (same image as prod), published on
`site-a.localhost`, then compared with Penpot's own rendering
(`export-shapes`, scale 1) of the same files re-imported into the local
Penpot 2.18. Captures by headless Chromium at the board width (1920 or 1440),
1280, 768 and 360 px, fonts loaded from the domain (Google families added by
the import), the dev cookie banner removed from the captures.

The first pass found 6 recurring defects. 5 were fixed in the converter
(round 2 below); the table shows the result after the fixes.

## Results per board (after fixes)

| Board | Same design (desktop) | Texts identical | Overflow 1280 / 768 / 360 | axe serious/critical | Height Penpot → Trefle (px at 600 wide) | Notable differences |
|---|---|---|---|---|---|---|
| agence · Accueil | yes | yes | none | contrast (5) | 938 → 940 | — |
| agence · Services | yes | yes | none | contrast (3) | 896 → 898 | — |
| agence · À propos | yes | yes | none | contrast (1) | 625 → 628 | carousel kept as drawn (reported) |
| agence · Contact | yes | yes | none | contrast (1) | 551 → 575 | map square instead of 579×500 (see « Left as is ») |
| agence · Mentions légales | yes | yes | none | — | 241 → 281 | slightly taller footer |
| blog · Accueil | yes | yes | none | contrast (4) | 536 → 538 | — |
| blog · Article | yes | yes | none | contrast (5) | 673 → 674 | — |
| blog · Article (2) | yes | yes | none | contrast (1) | 629 → 630 | — |
| blog · Auteur | yes | yes | none | contrast (1) | 493 → 496 | carousel kept as drawn (reported) |
| blog · Contact | yes | yes | none | contrast (1) | 314 → 339 | map, as agence · Contact |
| wireframe · Inicio | yes | yes | none | contrast (6) | 1901 → 1901 | free layout: scaled on mobile, action before publishing |
| wireframe · Equipo | yes | yes | none | — | 1309 → 1309 | same |
| wireframe · Blog | yes | yes | none | — | 1196 → 1196 | same |
| journal · Accueil | yes | yes | none | contrast (3) | 941 → 917 | footer bottom margin a little short |
| journal · Articles | yes | yes | none | contrast (3) | 530 → 510 | same |
| journal · Article | yes | yes | none | contrast (3) | 900 → 874 | same |
| journal · À propos | yes | yes | none | contrast (3) | 619 → 623 | — |
| journal · Guides | yes | yes | none | contrast (3) | 885 → 866 | — |
| journal · Auteur | yes | yes | none | contrast (3) | 618 → 600 | same footer margin |

- **SC-002** (clearly the same design, identical texts): 19/19.
- **SC-003** (no horizontal scroll at 360/768/1280): 19/19.
- **SC-006** (< 2 min for 5 boards): prod imports took 8, 4, 2 and 4 s
  (5, 5, 3 and 6 boards, screen checks included); dev 1–2 s.
- **axe**: the only serious finding is `color-contrast`, from the designs'
  own colours (white on magenta tags, pale placeholders, light grey text).
  Colours are never changed (user decision, research P7); the report lists
  them under « Accessibilité ».

## Defects found and fixed (round 2)

| # | Defect (first pass) | Cause | Fix |
|---|---|---|---|
| A | One-line labels broke in two (« About Us », « John doe », « Terms of Service ») — every file | Penpot's measured width of an « auto width » text was imposed; the browser draws it a fraction of a pixel wider | no imposed width for « auto width » texts (`max-width: 100%`); labels ≤ 200 px never squeezed by their row except on mobile |
| B | Hero text at the top of its cell instead of centred | a « fill » item in a grid kept the grid's `align-items: start` | grid items set to « fill » get `align-self`/`justify-self: stretch` |
| C | Avatars (and one image) missing | a frame with free content has no intrinsic width; its row shrank it to 3 px | fixed-width row items ≤ 160 px get their exact width and `flex-shrink: 0` |
| D | Blank lines between paragraphs lost | an empty paragraph became an empty `<p>` (no height) | empty paragraph → `<p><br></p>` |
| E | Image with an overlaid badge collapsed into a strip (blog · Accueil) | same as B | same as B |
| F | Large image shorter than in Penpot (journal · Guides) | aspect ratio taken from the drawn width (1120) instead of the visible one (720, Penpot crops) | ratio from the width visible in the parent |

A first version of A (`white-space: nowrap`) made 3 pages overflow at 768 px
(long « auto width » sentences); replaced by the rule above, re-measured:
no overflow anywhere. Also found during the evaluation: the contrast check
missed translucent colours (fixed before, PR #14), and the screen checks
were too verbose (80 « trop petit pour le doigt » lines on one page): the
report now groups them per kind of problem with the screens concerned and
5 examples.

## Left as is

- **Fill-height image in a fixed-height frame** (the two « Contact » maps):
  the browser keeps the image's natural ratio, so the map is square instead
  of 579×500 (+24 px). Fix possible (`contain: size` on such images), not
  worth the risk now.
- **Footer bottom margin** of The Journal ~20 px short.
- **Mobile** (360 px): readable and without overflow, but not designed:
  some agence sections lose their side margins, headers stack logo and menu
  (no burger menu), and on blog · Auteur the hero image seems to overlap the
  author block slightly. Penpot files often contain mobile boards (The
  Journal does); using them is a possible future improvement.
- **Carousels**: kept as drawn, reported (T052).
- **Free layout** (wireframe): scaled down on mobile, illegible on a phone;
  reported as an action before publishing (FR-011).
