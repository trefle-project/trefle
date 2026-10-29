# Feature Specification: Import a website from a Penpot file

**Feature Branch**: `015-penpot-site-import`

**Created**: 2026-10-06

**Status**: Draft

**Input**: User description: "Indépendamment d'une page de type Landing, j'aimerais pouvoir créer un site web avec des pages « free » de Trefle à partir de fichiers Penpot." Decisions taken with the user the same day: Penpot (open source, self-hosted) rather than Figma, so that starting an activity on Trefle needs no paid software; Penpot runs on the editor's own computer, so the design reaches Trefle as an exported `.penpot` file, not through Penpot's API; one board per page, laid out to adapt to every screen width (no separate mobile boards); a header or footer repeated across boards is copied into every page (shared sections are a later feature); re-importing a file always creates new draft pages named in Trefle `<board name>_<date>_<time>` (the public title stays the board name), never updates existing ones.

## Context

Imports 012 and 013 bring one existing web page into Trefle through Claude.
This feature starts from a design instead: a designer draws a small website in
Penpot, one board per page, links the boards together with Penpot's prototype
interactions (« Naviguer vers »), and exports the file. The editor first
chooses the domain the site is for, then drops the `.penpot` file into
Trefle, and gets one draft « free » page per board on that domain, with the
navigation between them already working.

A Penpot file describes its layouts with the same rules as the web (rows,
columns, grids, gaps, padding), its texts with their exact fonts and sizes, and
keeps its images inside the file. The conversion can therefore be done by
rules, without Claude: it is free, gives the same result every time, and does
not touch the import budget.

Out of scope for this feature: subscription and confirmation pages (no lead
form is created from a drawing), sections shared between pages (copied
instead, a later feature), updating pages already imported, separate mobile
boards, Figma files, and any connection to a Penpot server.

## Clarifications

### Session 2026-10-06

- Q: Faut-il limiter le nombre de boards importés en une seule fois ? → A: 10 boards cochés au maximum par import, avec un message clair au-delà.
- Q: Un éditeur qui importe une maquette peut-il ajouter des polices au domaine ? → A: Oui, l'import ajoute les polices quel que soit le rôle de l'utilisateur, et le rapport les nomme.
- Q: Faut-il mettre l'heure dans le nom des pages importées ? → A: Oui, date et heure : `Accueil_2026-10-06_14h32`. Précision de l'utilisateur : c'est le **nom de la page dans Trefle** (champ `title`, celui de la liste des pages), pas le titre public ; le titre public (`seo.metaTitle`) reçoit le nom du board seul (« Accueil »).
- Q: Faut-il empêcher la publication d'une page dont le board était en positionnement libre ? → A: Non : un avertissement « avant publication » dans le rapport, affiché en tête de la page dans l'éditeur ; la publication reste possible.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Turn a Penpot design into draft pages (Priority: P1)

A designer has drawn the pages of a small site in Penpot: « Accueil »,
« Services », « Contact », one board each, built with Penpot's flex and grid
layouts. They export the file and send it. The editor opens « Importer un site
Penpot » in the admin and first chooses the domain the site is for. Only then
can they drop the file. They see the list of boards found, each with a
proposed address (`/` for the first, `/services`, `/contact`), with a mark
on any address already used by a published page of that domain, and the
language pre-filled from the domain. They untick a board they don't want, correct an
address, and confirm. A few moments later the three pages exist as drafts of
type « free », named in Trefle `Accueil_2026-10-06_14h32`,
`Services_2026-10-06_14h32`, `Contact_2026-10-06_14h32` (their public
titles are simply « Accueil », « Services », « Contact »), each opening in the block editor and looking like its
board, with an import report.

**Why this priority**: This is the feature. Without it nothing else applies.

**Independent Test**: Export a three-board Penpot file built with flex and grid
layouts, import it: three draft free pages are created whose texts, colours,
fonts, spacing and images match their boards, and that remain usable from
360 px wide to desktop.

**Acceptance Scenarios**:

1. **Given** the import has just been opened, **When** no domain is chosen
   yet, **Then** the file cannot be dropped; once a domain is chosen, it can.
2. **Given** a domain is chosen and a `.penpot` file exported from Penpot 2,
   **When** the editor drops it, **Then** they see the file's Penpot pages and, for the chosen one, every
   top-level board with its name, its size (and a thumbnail when the file has
   one) and a proposed address, ticked (the first 10 when there are more).
3. **Given** the board list, **When** the editor unticks boards, edits
   addresses, keeps or changes the language and confirms, **Then** exactly one
   draft page of type « free » is created per ticked board, on the chosen
   domain, in that language, at that address, named in Trefle
   `<board name>_<import date>_<import time>`, with the board name alone as
   its public title.
4. **Given** a proposed address already used by a published page of the
   chosen domain, **When** the board list is shown, **Then** that address is
   marked « déjà publiée sur ce domaine » (information only: the import still
   creates a draft, and the clash is handled at publication).
5. **Given** a board built with flex or grid layouts, **When** its page is
   opened, **Then** texts are identical to the board, and colours, fonts, sizes,
   spacing, corner radii, borders and shadows match it; the page is editable
   block by block in the editor like any other page.
6. **Given** a board containing images, **When** the import completes,
   **Then** each image is in the Media library and the page uses it.
7. **Given** an imported page displayed at 360 px wide, **When** it is viewed,
   **Then** nothing overflows sideways and rows wrap or stack as their
   layout allows.

---

### User Story 2 - Keep the navigation between pages (Priority: P2)

In Penpot the designer linked the menu entries and buttons to the other boards
with « Naviguer vers » interactions, and the « Réserver » button to an outside
booking site with « Ouvrir une URL ». After import, clicking « Services » in
the menu of the home page leads to the Services page on the site, and
« Réserver » opens the booking site.

**Why this priority**: It is what makes a set of pages a website rather than
pages side by side, but the pages are useful even with links added by hand.

**Independent Test**: Import a file whose boards link to each other and to an
outside address; preview the home page and follow every link: each leads to
the expected imported page or outside address.

**Acceptance Scenarios**:

1. **Given** an element with a « Naviguer vers » interaction to a board that is
   part of the import, **When** the page is shown, **Then** that element is a
   link to the address chosen for that board's page.
2. **Given** an element with a « Naviguer vers » interaction to a board that
   was unticked or is outside the imported Penpot page, **When** the import
   completes, **Then** the element is not a link and the report names it.
3. **Given** an element with an « Ouvrir une URL » interaction to an http(s)
   address, a `mailto:` or a `tel:` address, **When** the page is shown,
   **Then** it is a link to that address.
4. **Given** an address changed for a board in the board list, **When** the
   import runs, **Then** every link to that board uses the changed address.

---

### User Story 3 - Import a new version of the design (Priority: P3)

A week later the designer changes the colours and adds a « Tarifs » board,
and sends the new file. The editor imports it on the same domain. New drafts
appear, named with the new date and time; the pages already on the site are not
touched. The editor checks the new drafts, then publishes them in place of the
old ones.

**Why this priority**: The design changes over the life of a site; without
this the first import would be a dead end. It needs no new mechanism beyond
Story 1, only guarantees about what is left alone.

**Independent Test**: Import a file, publish its pages, import a changed
version of the file on the same domain: new drafts with the new date are
created and the published pages are unchanged.

**Acceptance Scenarios**:

1. **Given** pages already imported (draft or published) from an earlier
   version of the file, **When** the new version is imported, **Then** new
   draft pages are created and no existing page is changed.
2. **Given** a new draft whose address is already used by a published page on
   the domain, **When** the editor tries to publish it, **Then** publishing is
   refused with the existing message naming the address in use, until the
   older page is unpublished or moved.
3. **Given** two imports of the same file on the same day, **When** both
   complete, **Then** both sets of pages exist, and each import record lists
   which pages it created.

---

### User Story 4 - Give a domain its own fonts (Priority: P2)

When setting up a domain (new or existing), the administrator lists its
fonts in the domain's settings, « Polices du domaine »: for example
« Inter Tight » in 400 and 700 and « EB Garamond » in 400 italic, chosen
from Google Fonts. Trefle fetches them once and serves them itself. From
then on, every page of that domain can use them: they appear in the
editor's font list for that domain's pages, and the published pages load
them from Trefle, never from Google. A Penpot import on that domain adds the
fonts its design uses to the list automatically.

**Why this priority**: The Penpot import needs fonts to look like the
design, and setting them once per domain also serves pages built by hand.
The pages are still usable without it: they fall back to standard fonts.

**Independent Test**: Add « EB Garamond » 400 to a domain, set a heading in
a page of that domain to EB Garamond in the editor, publish: the public page
shows EB Garamond and makes no request to a Google server.

**Acceptance Scenarios**:

1. **Given** a domain's settings, **When** the administrator adds a Google
   font family with its weights and styles and saves, **Then** the font is
   stored by Trefle and listed on the domain with its weights.
2. **Given** a family name that does not exist on Google Fonts, **When** the
   administrator saves, **Then** saving is refused with a message naming the
   family.
3. **Given** a domain with fonts, **When** an editor edits a page of that
   domain, **Then** those fonts are offered in the editor's font list and
   displayed in the editor as on the published page.
4. **Given** a published page of that domain using one of its fonts, **When**
   a visitor opens it, **Then** the font is loaded from Trefle's own address
   and no request goes to a Google server.
5. **Given** a Penpot import on a domain, **When** the design uses Google
   fonts (or Penpot's default font) the domain does not list yet, **Then**
   the import adds them, with the weights and styles used, to the domain's
   fonts, and the report names the fonts added.

---

### Edge Cases

- **Not a Penpot file, or a damaged one** → refused before anything runs, with
  a message saying a `.penpot` file exported from Penpot is expected.
- **A file from Penpot 1** (older format) → refused, with a message asking to
  open it in Penpot 2 and export it again.
- **A file with several Penpot pages** → the editor picks one; only its boards
  are listed.
- **Mobile versions drawn next to the desktop boards** (e.g. « Accueil —
  Mobile ») → listed like any other board and imported as separate pages if
  left ticked; the editor unticks them. Merging them into the desktop page is
  out of scope.
- **A Penpot page with no board** (shapes drawn directly on the canvas) →
  nothing to import; the message explains that each website page must be a
  board.
- **A board, or part of one, positioned freely** (no flex or grid layout) →
  imported keeping its look at desktop width, scaled down so it never overflows
  on small screens; the report names it and says it will not rearrange itself
  on mobile.
- **Two boards with the same name, or a name giving an empty or invalid
  address** (« ★ », « / ») → distinct addresses are proposed (`/services`,
  `/services-2`); the editor can correct them; duplicate addresses within one
  import are refused before confirming.
- **A board drawn wider than usual for a desktop** (e.g. 2560 px) → the page
  keeps its proportions and adapts; nothing requires a specific board width.
- **A font that is neither a Google font nor Penpot's default font** → the page
  uses a close standard font; the report names the missing font.
- **A font removed from a domain's list** while pages still use it → those
  pages fall back to their standard font; the domain settings warn about it
  before saving, naming how many pages use the font.
- **Two domains using the same font** → stored once, listed on each domain.
- **Shapes and icons drawn in Penpot** (vectors, boolean shapes) → kept as
  images that stay sharp at every size.
- **Images with no meaningful name** → imported; the report lists images that
  need an alternative text.
- **Elements Penpot hides, or interactions other than a click** (hover,
  overlays, « Retour ») → hidden elements are not imported; other
  interactions are ignored and listed in the report.
- **A component used on several boards** (menu, footer) → copied into every
  page that uses it.
- **Drawings of form fields** (a rectangle reading « Votre e-mail ») → imported
  as their look only; no working form is created and the report says so.
- **More than 10 boards on the Penpot page** → all are listed, but at most 10
  can be ticked; the editor imports the rest in a second import.
- **A very large file**, or a file containing far more shapes than a website
  needs → refused with the limit stated, before anything is created.
- **A board too detailed for the editor** (its page would exceed what the
  editor can save) → the import fails before creating anything, naming the
  board; the editor unticks it or simplifies it in Penpot, then imports
  again.
- **The import fails or is cancelled midway** → no page and no Media item from
  it remain, and the uploaded file is gone.

## Requirements *(mandatory)*

### Functional Requirements

**Starting an import**

- **FR-001**: Users allowed to import pages (012 FR-003) MUST be able to start
  « Importer un site Penpot » from the Pages list, and from an active
  domain's own page in the admin. From the Pages list, its first step MUST be
  the choice of an active domain. From a domain, that domain MUST already be
  chosen, and can still be changed before the file is dropped. In both
  cases the file MUST NOT be accepted before a domain is chosen, and once the
  file is analysed the domain stays fixed for the whole import (changing it
  means starting again). The import also asks for a `.penpot` file and a
  language, pre-filled with the domain's default language. The page type is
  always « free » and is not asked.
- **FR-002**: The system MUST accept only files exported from Penpot 2 (the
  zipped `.penpot` format) up to 100 MB. Other files, including Penpot 1
  exports, MUST be refused before anything is created, with a French message
  saying what is expected and how to export it from Penpot.
- **FR-003**: The file MUST be treated as untrusted: its contents MUST NOT be
  able to run code, reach the CMS's internal network, write outside the
  import's own working space, or exhaust the server (limits on unpacked size,
  number of files and number of shapes, refused with a message).
- **FR-004**: When the file has several Penpot pages, the editor MUST choose
  one. Every top-level board of that page MUST then be listed with its name,
  its size, a thumbnail when the file contains one, and a proposed address,
  ticked by default (only the first 10 in reading order when there are
  more).
- **FR-005**: Proposed addresses MUST be derived from board names (lower case,
  accents removed, words joined with hyphens); the first listed board MUST be
  proposed as `/`. Every address already used by a published page of the
  chosen domain MUST be marked as such, as information only. The editor MUST
  be able to untick boards and edit every address before confirming. At most
  10 boards can be ticked in one import; ticking an 11th MUST be prevented
  with a message saying to import the rest in a second import. Confirming MUST be refused while two ticked
  boards share an address or an address is invalid.

**Creating the pages**

- **FR-006**: Confirming MUST create exactly one draft page per ticked board,
  of type « free », on the chosen domain, in the chosen language, at the
  chosen address. Its **name in Trefle** (the page `title` shown in the
  admin) MUST be `<board name>_<date>_<time>`, written `AAAA-MM-JJ_HHhMM`
  (e.g. `Accueil_2026-10-06_14h32`). Its **public title** (SEO title, used
  by browsers and search engines) MUST be the board name alone (« Accueil »),
  so the dated name never shows publicly.
- **FR-007**: An import MUST never change, unpublish or delete an existing
  page. Address clashes with published pages MUST be left to the existing
  publish check.
- **FR-008**: Each page MUST be made of editable blocks in the block editor,
  like a page built by hand, not a single frozen block.
- **FR-009**: Texts MUST be taken verbatim from the board. Fonts, sizes,
  weights, line heights, letter spacing, alignment and colours MUST match it.
- **FR-010**: Penpot flex and grid layouts MUST be reproduced with their
  direction, wrapping, alignment, gaps, padding and sizing rules, so that the
  page rearranges itself as the board's layout allows when the screen narrows.
  Fills (colours and gradients), borders, corner radii, shadows, opacity and
  blur MUST be reproduced.
- **FR-011**: Content positioned freely (outside any flex or grid layout) MUST
  keep its look at the board's width and scale down proportionally below it,
  so that no page overflows sideways at 360 px; the report MUST name each such
  board or section. When a whole board is positioned freely, its page's
  report MUST carry an action before publishing (« Cette page ne se
  réorganise pas sur mobile : adaptez-la avant de la publier »), shown at the
  top of the page's edit view. Publishing MUST NOT be blocked for it: the
  editor may already have reworked the page.
- **FR-012**: Images contained in the file MUST be stored in the Media library
  (owned by the importing user and listed on the import record, so a failed
  import can remove them) and used by the page. Vector
  shapes and icons MUST be kept sharp at every size. Elements hidden in Penpot
  MUST NOT be imported.
- **FR-013**: Fonts MUST be served from Trefle's own storage, never from a
  third-party font service. Google fonts and Penpot's built-in default font
  used by the design MUST be added to the domain's fonts (FR-024) with the
  weights and styles used, and used as designed. Any other font (e.g. a team
  font uploaded to Penpot, which its exports do not contain) MUST fall back
  to a close standard font. The report MUST name both the fonts added to the
  domain and the fonts replaced.
- **FR-014**: Each page MUST have exactly one main heading and a sensible
  heading order, derived from the board's text styles (named styles such as
  « H1 »/« Titre 1 » first, otherwise text size). Each published page built
  from an import MUST be able to meet the project's accessibility bar (no
  serious or critical automated accessibility issue) once the editor has
  filled the alternative texts the report asks for.
- **FR-015**: A component instance (e.g. the same menu on every board) MUST be
  copied into each page that uses it.

**Links**

- **FR-016**: An element with a « Naviguer vers » interaction on click towards
  a board included in the import MUST become a link to that board's page
  address. Towards any other board, the element MUST stay a plain element and
  be listed in the report.
- **FR-017**: An element with an « Ouvrir une URL » interaction on click
  towards an http(s) address, an e-mail address (`mailto:`) or a phone number
  (`tel:`) MUST become a link to it. Any other scheme (e.g. `javascript:`)
  MUST be dropped and listed in the report.
- **FR-018**: Other interactions (hover, overlays, « Retour », delays) MUST be
  ignored and listed in the report.

**Progress, report and record**

- **FR-019**: The import MUST show its progress and be cancellable. A failure
  or cancellation MUST leave no page and no Media item from it, with a French
  message saying what went wrong.
- **FR-020**: Every created page MUST carry an import report, like 012 pages,
  listing at least: freely positioned sections, missing fonts, images needing
  an alternative text, links that could not be made, ignored interactions,
  form drawings that are not working forms.
- **FR-021**: The system MUST keep one record per import with: who started it,
  when, the file name, the Penpot page imported, the domain, the language,
  the status, and the list of pages it created. The record MUST be visible
  next to the existing page imports.
- **FR-022**: The uploaded file MUST be kept only while its import runs and
  deleted when it completes, fails or is cancelled; it MUST NOT become a Media
  item.
- **FR-023**: The import MUST NOT use Claude or any paid service, record a cost
  of zero, and MUST NOT count against the monthly import budget.

**Domain fonts (User Story 4)**

- **FR-024**: A domain's settings MUST include « Polices du domaine »: a list
  of Google Fonts families, each with the weights (100–900) and styles
  (normal, italic) wanted. Only administrators edit it (like the rest of a
  domain's settings). A Penpot import adds to it (FR-013) whatever the
  importing user's role, editors included; it only ever adds families,
  weights or styles, never removes or changes one.
- **FR-025**: Saving a domain MUST check each family against Google Fonts and
  store the missing font files in Trefle (only the Latin character sets);
  an unknown family or weight MUST block saving with a message naming it.
  Font files MUST be stored once, whatever the number of domains using them.
- **FR-026**: Every published page of a domain MUST be able to use that
  domain's fonts, loaded from Trefle's own address with text shown in a
  fallback font while the font loads; a page MUST NOT load fonts of other
  domains.
- **FR-027**: In the block editor, a page's font list MUST offer its domain's
  fonts in addition to the standard ones, and the editor canvas MUST display
  them. A page without a domain gets the standard list only.
- **FR-028**: Before saving the removal of a font still used by pages of the
  domain, the settings MUST say how many pages use it; saving MUST remain
  possible (those pages then fall back to their standard font).

### Key Entities

- **Site import**: one import of a `.penpot` file — who, when, file name,
  chosen Penpot page, domain, language, status, the boards ticked with their
  addresses, and the pages created. Comparable to an 012 import request, but
  producing several pages.
- **Imported page**: an ordinary draft page of type « free », linked back to its
  site import and to the board it came from, with its import report.
- **Uploaded Penpot file**: the exported design handed in by the editor; exists
  only while its import runs.
- **Domain font**: a font family a domain declares, with its weights and
  styles; points to font files stored once by Trefle and shared between
  domains.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An editor turns a received five-board `.penpot` file into five
  linked draft pages in under 5 minutes of their own time, without help.
- **SC-002**: On a reference file of at least three boards built with flex and
  grid layouts, every imported page is judged "clearly the same design" as its
  board at desktop width, and every text is identical.
- **SC-003**: Every page imported from the reference file shows no sideways
  overflow at 360 px, 768 px and 1280 px wide.
- **SC-004**: 100 % of « Naviguer vers » links between imported boards, and of
  « Ouvrir une URL » links to http(s), `mailto:` and `tel:` addresses, work on
  the published pages.
- **SC-005**: Importing the same file twice produces pages that look the same;
  no existing page is ever modified by an import.
- **SC-006**: An import of a five-board file completes in under 2 minutes and
  costs nothing.
- **SC-007**: No uploaded file remains stored once its import has ended, and no
  crafted file (oversized, zip bomb, path tricks, scripts in vectors) can run
  code or reach an internal address (verified by tests).
- **SC-008**: An administrator adds a Google font to a domain in under 1
  minute, and no published page of any domain makes a request to a Google
  font server (verified on the reference pages).

## Assumptions

- Designers use Penpot 2 (tested with 2.18) on their own computer and export
  with « Exporter » in the `.penpot` format; Trefle never connects to a Penpot
  server.
- Each website page is one top-level board, built mostly with flex and grid
  layouts. Boards drawn for mobile alongside desktop ones are imported as
  separate pages unless unticked; merging them is out of scope (confirmed
  with the user, 2026-10-06).
- Reference set for SC-002/SC-003: four `.penpot` files kept outside the repo
  (`penpot/references/`), built from Penpot's own published samples — chiefly
  « The Journal » (a six-page blog reconstructed from Ghost's Source theme,
  with 119 prototype links including a `mailto:`), plus an agency site, a blog
  with duplicate board names, and a freely positioned wireframe site.
- The date and time in page names are those of the moment the import is
  confirmed, in the CMS's time zone (Europe/Paris), to the minute. Two
  imports in the same minute give identical names; the import record tells
  them apart.
- Address of the first listed board as `/` is a sensible default that the
  editor reviews in the board list.
- Shared sections (a header edited once for all pages) are the next feature;
  until then, a change to the menu means editing each page or re-importing.
- Copying Google fonts into Trefle's storage is allowed by their open
  licences; for other fonts, the editor is responsible for the licence, as for
  any content they import.
- Domain fonts are limited to Google Fonts in this feature. Uploading a
  font file of one's own (a brand font) is a possible later addition.
- Letting an editor's import add fonts to a domain (FR-024) is safe because
  adding a font changes nothing on existing pages (confirmed with the user,
  2026-10-06).
- 100 MB covers a website design with its images; larger files are rare and
  can be exported with lighter images.
- The rules-based conversion is enough for designs built with layouts; a
  Claude-assisted fallback for freely positioned designs may be considered
  later if the reference evaluation shows the need.
