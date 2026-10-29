# Feature Specification: Import a page from a URL into the block editor

**Feature Branch**: `012-url-page-import`

**Created**: 2026-09-27

**Status**: Draft

**Input**: User description: "Je voudrais pouvoir automatiser la création d'une
page à partir d'une page existante sur le web. Je fournis une Url et GrapesJS
va composer une page la plus proche possible visuellement de la page fournie,
tout en respectant les modules tels qu'ils existent dans l'éditeur GrapesJS. Il
faut que cette page générée soit éditable dans GrapesJS comme si elle était
nativement construite from scratch dans GrapesJS, images uploadées y compris."

## Context

Today every page starts from one of the starter templates offered by the page
creation wizard (004-page-types) and is then rebuilt by hand, block by block,
in the block editor. Reproducing an existing landing page — typically one
of our own pages still hosted elsewhere, or a reference page a client wants
matched — means retyping every text, re-downloading and re-uploading every
image, and restyling every section by eye. This is slow and error-prone.

This feature lets an editor give a public web address and receive a draft
page that looks as close as possible to the source page while being built
**only from what the block editor offers**: the same blocks an editor drags
from the block library, the same styling an editor can apply, and images that
live in the Media library like any uploaded image. Because the current library
has no way to lay content out side by side, this feature also adds two
general-purpose layout blocks — **Section** and **Columns** — to the library,
available to every editor for building pages by hand, not only to the import.
Once imported,
nothing distinguishes the page from one built by hand: every element is
selectable, editable, movable and deletable with the usual editor actions,
and the page goes through the exact same publish rules and rendering pipeline
as every other page.

Constraints inherited from the existing product that shape "as close as
possible":

- The block library today: Hero, Text, Image, Call-to-action button, Lead
  form (placeholder, exactly one on subscription pages, none on free pages),
  Testimonial — extended by this feature with Section and Columns, and with
  nothing else.
- Published pages only keep a fixed set of safe content (headings, paragraphs,
  lists, links, images, basic text formatting, generic sections with styling).
  Anything outside it — videos, embedded maps, iframes, scripts, tables,
  third-party widgets, source-site forms — cannot survive publishing and so
  must not be produced by the import either.
- Images must come from the Media library and respect its size limit.
- The block editor already offers four device views — Desktop, Tablet,
  Mobile landscape, Mobile portrait — and styles set while one of them is
  selected apply only to that screen size and below. This is the one and only
  way per-screen adjustments are expressed, by hand or by the import.

Out of scope: importing several pages or a whole site at once; keeping an
imported page in sync with its source afterwards; reproducing interactive
behaviour (carousels, animations, accordions, tabs, scripts, tracking tags);
reproducing the source site's navigation menu or footer as working
navigation; pages that require signing in or paying to view; importing from
anything other than a web address (file upload, pasted HTML).

## Clarifications

### Session 2026-09-27

- Q: How strictly must the import stay within the existing six blocks? → A:
  Add new general-purpose blocks as part of this feature (Section, Columns),
  usable by hand as well as by the import, so imported layouts can stay side
  by side instead of being stacked.
- Q: Where is an import started — page creation, an existing page, or both?
  → A: Only from the page creation wizard, producing a new draft page. No
  import into an existing page.
- Q: May the source page's content (screenshot and markup) be sent to an
  external, pay-per-use AI service to perform the conversion? → A: Yes — an
  external AI service is allowed; only the source page's public content is
  sent, and the cost of imports is kept visible and bounded.
- Q: How is the cost of imports bounded? → A: A global monthly cap in euros,
  set by an administrator; once reached, imports are refused with a clear
  message until the next month; the month's running total is visible to
  administrators. *(Complemented later in this session by per-user budgets —
  see below; the global cap remains the ceiling on the total bill.)*
- Q: Should imported pages reuse the source page's web fonts, given published
  pages only use the system font today? → A: No — imported pages keep the
  system font; the substitution is noted in the import report.
- Q: What happens when imported content misses the product's accessibility
  minimums (missing alternative text, low contrast, skipped heading levels)?
  → A: Reproduce faithfully and list every issue in the import report as "to
  fix before publishing"; an image without alternative text is flagged, never
  given its file name as a description.
- Q: How are source forms reproduced? → A: Only with the form tools that
  already exist in the page editor — the lead-form block and the page's form
  settings (field list, field types, labels, required flags, options,
  success message, consent and privacy settings). No other form mechanism is
  created or imported.
- Q: Must the lead-form block be placeable inside a Section or a Column?
  → A: Yes — the lead-form block works anywhere in the page, including inside
  Section and Columns, so an imported form keeps its source position (e.g.
  next to the hero text).
- Q: How does the import know and reproduce the page's rendering on other
  screen formats? → A: The source page is rendered at desktop, tablet and
  mobile widths and all three renderings inform the conversion; the imported
  page carries per-device adjustments written with the editor's existing
  device views (Desktop, Tablet, Mobile landscape, Mobile portrait), exactly
  as an editor would set them by hand; the result is then checked
  automatically at each device width and issues are reported.
- Q: Can administrators also set a maximum monthly AI budget per user? → A:
  Yes, in addition to the global cap (which remains the ceiling on the total
  bill): each user has a monthly import budget in euros, set by
  administrators in the admin interface, with a workspace default for users
  without their own value; an import must fit both the user's budget and the
  global cap.
- Q: What happens to an import whose cost takes the user past their budget
  while it runs? → A: It always runs to its result. Budgets are only checked
  before a request is launched: a new request is refused if the budget is
  already used up at that moment; a request in progress is never stopped,
  degraded or failed because of a budget.
- Q: Does leaving the wizard while an import runs cancel it? → A: No. Only
  the explicit "cancel" action cancels an import. An import whose wizard was
  left runs to its result; the editor finds it afterwards in the list of
  imports (status, report, link to the created draft) and the draft in the
  Pages list.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Import a public page as an editable draft (Priority: P1)

An editor creating a new page chooses to start from an existing web page
instead of a starter template. They paste the page's address, pick the page
type as usual, and start the import. After a short wait with visible progress,
the block editor opens on a new draft page whose sections, texts, headings,
links, colours, spacing and overall layout mirror the source page, composed
entirely of blocks from the block library. An import report tells them what
was reproduced, what was simplified and what could not be imported.

**Why this priority**: This is the feature. Without it nothing else has value,
and on its own it already removes the bulk of the retyping and restyling work.

**Independent Test**: Import a known public landing page; confirm a draft page
is created, that every top-level element is a recognised library block, that
every text can be edited in place, and that the page previews without any
content disappearing compared to the editor canvas.

**Acceptance Scenarios**:

1. **Given** an editor in the page creation wizard, **When** they choose
   "import from a web page", enter a valid public address and confirm,
   **Then** a new draft page is created and opened in the block editor with
   content reproducing the source page, and an import report is shown.
2. **Given** an imported page open in the editor, **When** the editor selects
   any text, heading, button or section, **Then** they can edit, restyle,
   move, duplicate or delete it exactly as they would a block they had
   dragged in themselves.
3. **Given** an imported page, **When** the editor previews or publishes it,
   **Then** what visitors see matches what the editor canvas showed — no
   imported element is silently dropped at publish time.
4. **Given** a source page containing elements the library cannot represent
   (e.g. a video, a map, a carousel), **When** the import completes, **Then**
   those elements are omitted or simplified (e.g. a carousel becomes its first
   slide) and each omission is listed in the import report.
5. **Given** an address that cannot be imported (unreachable, not a web page,
   requires sign-in, internal network address), **When** the editor starts
   the import, **Then** no page is created and the editor sees a plain-language
   explanation of why, and can correct the address and retry.
6. **Given** a source page whose mobile rendering differs from its desktop
   rendering (e.g. smaller headings, an element hidden on phones, tighter
   spacing), **When** the import completes and the editor switches the
   editor to the Tablet or Mobile portrait device view, **Then** the imported
   page shows the corresponding adjustments, and the editor can change or
   remove them with the usual per-device styling, like adjustments made by
   hand.

---

### User Story 2 - Images arrive in the Media library (Priority: P2)

Every image visible on the source page — content images and section
background images — is retrieved, added to the Media library, and used by the
imported page exactly like an image the editor had uploaded themselves. The
editor can swap, remove or reuse any of them through the usual image picker.

**Why this priority**: Images are the most tedious part of rebuilding a page
by hand (download, rename, resize, upload, place). Story 1 is still usable
with placeholders, but the page is not "as close as possible" without them.

**Independent Test**: Import a page with several images; confirm each one now
exists in the Media library with a meaningful description, that the imported
page references only Media library images, and that no image on the page
still points at the source website.

**Acceptance Scenarios**:

1. **Given** a source page with images, **When** the import completes,
   **Then** each distinct image appears once in the Media library, with the
   source image's alternative text as its description, and the page displays
   it at the same place; an image with no alternative text on the source is
   listed in the report as "to describe" and never described by its file
   name.
2. **Given** a source image larger than the Media library size limit, **When**
   it is imported, **Then** it is reduced to fit the limit while staying
   visually acceptable; if that is impossible, the standard image placeholder
   is used instead and the report lists the image.
3. **Given** an imported page, **When** the editor opens the image picker on
   any imported image, **Then** the imported images are listed alongside
   existing Media library images and can be swapped like any other.
4. **Given** the same image used several times on the source page, **When**
   imported, **Then** it is stored once in the Media library and reused.

---

### User Story 3 - Section and Columns blocks in the library (Priority: P2)

Any editor building a page by hand finds two new blocks in the block library:
**Section**, a full-width band that holds other blocks and carries its own
background (colour or image), spacing and content width; and **Columns**, a
row of two to four side-by-side columns, each holding other blocks, that
stack vertically on narrow screens. Imported pages use exactly these blocks
for their layout, so what an import produces can be recreated and modified by
hand.

**Why this priority**: The import (Story 1) relies on these blocks for its
visual fidelity, and they are useful on their own for hand-built pages. They
come after Story 1 in value, not in build order.

**Independent Test**: Without any import, build a page by hand with a Section
containing a Columns block of three columns, each holding an Image, a Text and
a Call-to-action block; publish it and check it renders side by side on
desktop, stacked at 360px width, with nothing dropped.

**Acceptance Scenarios**:

1. **Given** the block editor, **When** an editor drags a Section block onto
   the canvas, **Then** they can drop any other library block inside it and
   set its background colour or image, inner spacing and content width with
   the standard styling tools.
2. **Given** the block editor, **When** an editor drags a Columns block,
   **Then** they can choose two, three or four columns, drop any library block
   into each column, and change the number of columns afterwards without
   losing the content of the remaining columns.
3. **Given** a published page using Columns, **When** it is viewed at 360px
   width, **Then** the columns stack vertically in their original order and
   the page stays usable.
4. **Given** a subscription page, **When** the lead-form block is placed
   inside a Section or a Column, **Then** the publish rules and the live form
   behave exactly as when it is placed at the top level.
5. **Given** a Section or Columns block, **When** the editor nests a Columns
   block inside a Section, **Then** it works; nesting Columns inside a Column
   is not offered (one level of columns only).

---

### User Story 4 - Source form becomes the page's lead form (Priority: P3)

When the source page contains a sign-up or contact form and the new page is a
subscription page, the import places the lead-form block where the source
form was and pre-configures the page's form with the fields it detected,
mapped to the field types the product supports.

**Why this priority**: Saves setting up the form by hand, but the form is
quick to configure manually and the publish rules already guide the editor
to add one.

**Independent Test**: Import, as a subscription page, a source page with a
form containing e.g. an email, a name and a phone field; confirm one lead-form
block sits where the form was and the page's form settings list matching
fields.

**Acceptance Scenarios**:

1. **Given** a source page with one form, imported as a subscription page,
   **When** the import completes, **Then** exactly one lead-form block is
   placed at the form's position and the page's form fields are pre-filled
   with the detected fields (label, type, required) mapped to supported types.
2. **Given** a source page with several forms, imported as a subscription
   page, **When** the import completes, **Then** only the most prominent form
   (the first one containing an email field, otherwise the first one) becomes
   the lead form; the others are omitted and listed in the report.
3. **Given** a source page with a form, imported as a free page, **When** the
   import completes, **Then** no lead-form block is placed and the report
   says the form was omitted because free pages cannot carry one.
4. **Given** a source page without a form, imported as a subscription page,
   **When** the import completes, **Then** the report reminds the editor that
   a lead-form block must be added before publishing.

---

### Edge Cases

- The source page builds its content with scripts after loading: the import
  reproduces what a visitor sees once the page has finished loading, not the
  raw, empty initial document.
- Cookie-consent banners, chat widgets, pop-ups and sticky overlays on the
  source page are not reproduced.
- The source page is very long (dozens of sections) or very heavy (many
  large images): the import either completes within the time limit or stops
  with a clear message; it never leaves a half-built page without telling the
  editor.
- The source redirects to another address: the final address is imported and
  the report states it.
- The address points to a file (PDF, image) rather than a web page: rejected
  with an explanation.
- The address points to an internal or private network location, or uses a
  non-web scheme: rejected before anything is fetched.
- The source uses web fonts: text is reproduced with the system font used by
  every published page (no font is imported or loaded) and the report names
  the source fonts that were substituted.
- Links on the source page are kept pointing to their original absolute
  addresses; links that were relative to the source site are made absolute.
- Two editors import pages at the same time: both imports complete
  independently.
- The global cap or the editor's user budget is used up: the "import from a
  web page" option explains which one, why it cannot
  be used and when it becomes available again, instead of failing after the
  editor has filled in the form.
- An administrator lowers a user's budget below what that user has already
  spent this month: nothing already spent is affected; the user simply cannot
  start another import until next month or until the budget is raised.
- The editor leaves the wizard (closes the tab, navigates away) while an
  import is running: the import is **not** cancelled and runs to its result;
  the editor finds it afterwards in the list of imports — with its status, its
  report or failure reason, and a link to the created draft — and the draft
  appears in the Pages list like any other.
- The editor cancels an import with the explicit "cancel" action: no page is
  created and no images added by that import are left in the Media library.
- The source page is in a language other than French: texts are imported
  as-is, and the page language field keeps its usual default for the editor
  to set.

## Requirements *(mandatory)*

### Functional Requirements

**Starting an import**

- **FR-001**: The page creation wizard MUST offer "import from a web page" as
  an alternative to choosing a starter template, collecting the source address
  alongside the usual type, domain, path and title. Starting from a starter
  template remains the default, preselected path, unchanged from today;
  importing is an opt-in choice the editor makes explicitly, and the wizard
  works exactly as before for anyone who does not pick it (including when
  imports are unavailable). Importing into an existing page is not offered.
- **FR-002**: The system MUST accept only public `http`/`https` addresses and
  MUST refuse, before fetching anything, addresses that resolve to internal,
  private or local network locations.
- **FR-003**: Only signed-in users allowed to create pages MUST be able to
  start an import.
- **FR-004**: The system MUST show progress while an import runs and MUST let
  the editor cancel it. Only this explicit cancel action cancels an import;
  leaving the wizard does not.
- **FR-004a**: Editors MUST be able to find each of their imports afterwards
  in a list showing its address, status, start time, failure reason if any,
  and a link to the created draft page.

**Composing the page**

- **FR-005**: The imported page MUST be composed exclusively of blocks from the
  block library (the existing six plus Section and Columns) and of content and
  styling an editor could produce by hand with the editor's own tools; no
  element type outside that set may be generated.
- **FR-005a**: Side-by-side arrangements on the source page (feature grids,
  text next to an image, logo rows, pricing columns) MUST be reproduced with
  Columns blocks; full-width bands with their own background MUST be
  reproduced with Section blocks. Arrangements of more than four columns MUST
  wrap onto several rows of Columns.
- **FR-006**: The import MUST reproduce, in source order, the page's visible
  sections, headings (with their level), paragraphs, lists, links, buttons,
  quotes/testimonials and images, together with their text colours,
  background colours, font sizes, weights and styles (but not the font family
  — see FR-006a), alignment and spacing, as seen at desktop width; per-device
  differences are covered by FR-011 to FR-011c.
- **FR-006a**: Imported pages MUST use the same system font as every other
  published page; no web font from the source is imported, hosted or loaded.
- **FR-007**: Source elements that cannot be represented (videos, maps,
  iframes, scripts, tables, carousels, animations, third-party widgets, site
  navigation menus) MUST be omitted or reduced to a representable equivalent,
  and every such case MUST appear in the import report.
- **FR-008**: The generated page MUST NOT contain anything that the publish
  step would strip: what the editor sees on the canvas after import is what
  visitors see once published.
- **FR-009**: Every imported element MUST be selectable, editable, stylable,
  movable, duplicable and deletable with the standard editor actions; no
  imported element may be locked or behave differently from a hand-built one.
- **FR-010**: The imported page MUST be saved as a regular draft of the chosen
  page type and MUST go through the existing publish rules unchanged
  (including the lead-form rules per page type).
- **FR-011**: The source page MUST be rendered and analysed at three widths —
  desktop, tablet and mobile — so the conversion knows how the page actually
  reads on each format (element order, hidden elements, text sizes, spacing).
- **FR-011a**: Where the source's tablet or mobile rendering differs from its
  desktop rendering, the imported page MUST reproduce the difference with
  per-device adjustments set through the editor's existing device views
  (Tablet for tablet widths, Mobile portrait for phone widths; Mobile
  landscape inherits the Tablet adjustments unless the editor sets its own).
  Adjustments are limited to the styling an editor can set by hand (text
  size, weight, alignment, colours, spacing, content width) plus hiding an
  element on that device. No other mechanism for per-screen behaviour may be
  generated.
- **FR-011b**: Imported layouts MUST remain usable on every device view even
  when the source is not responsive: columns stack in order on narrow screens
  (FR-024) and adjustments are added where needed to avoid unreadable text or
  overflowing content; the report says when the source had no mobile layout
  of its own.
- **FR-011c**: Before the draft is handed to the editor, the imported page
  MUST be checked automatically at the width of each device view for:
  horizontal scrolling, text smaller than 14px, buttons (and links styled as
  buttons) smaller than 44px in either dimension, standalone text links (a
  link that is its paragraph's whole text, such as a card title) smaller than
  24px in either dimension (WCAG 2.2 target size; links inside a sentence are
  exempt), and images or blocks wider than the screen.
  Every issue found MUST be listed in the import report with the device view
  concerned; issues do not block the import or publishing.

**Layout blocks**

- **FR-022**: The block library MUST offer a Section block: a full-width band
  that accepts any other library block, with a background colour or Media
  library background image, inner spacing and a content width, all set with
  the standard styling tools.
- **FR-023**: The block library MUST offer a Columns block of two, three or
  four columns, each accepting any library block except another Columns
  block; the number of columns MUST be changeable after insertion without
  losing the content of the columns that remain.
- **FR-024**: Columns MUST stack vertically, in order, below a narrow-screen
  width, so pages remain usable from 360px wide; above it, all the columns of
  a Columns block MUST stay on one row (no partial wrap such as 3 + 1).
- **FR-025**: Section and Columns MUST publish exactly as shown in the editor
  (nothing stripped at publish time), and the lead-form block MUST keep
  working and keep satisfying the publish rules when placed inside them.

**Images**

- **FR-012**: Every image visible on the source page, including section
  background images, MUST be retrieved and added to the Media library, and
  the imported page MUST reference only Media library images.
- **FR-013**: Each imported image MUST carry the source's alternative text as
  its description. When the source has none, the file name MUST NOT be used
  as the text offered to screen-reader users; the image is flagged "to
  describe" in the import report instead.
- **FR-014**: Images exceeding the Media library size limit MUST be reduced to
  fit; images that cannot be retrieved or reduced MUST be replaced by the
  standard image placeholder and listed in the report.
- **FR-015**: An image used several times on the source page MUST be stored
  once and reused.

**Forms**

- **FR-016**: For a subscription page, the most prominent source form MUST be
  replaced by the single lead-form block at its position, and the page's form
  fields MUST be pre-filled from the detected fields, mapped to supported
  field types (fields with no supported equivalent are listed in the report).
- **FR-016a**: Forms MUST be reproduced exclusively with the page editor's
  existing form tools: the lead-form block and the page's form settings. The
  import MUST NOT generate any other form markup, form component or form
  behaviour; the imported form behaves, validates and publishes exactly like
  a form set up by hand. Settings the source cannot provide (success message,
  consent text, privacy notice) are left for the editor, prefilled with the
  workspace defaults where they exist, and listed in the report.
- **FR-017**: For a free or confirmation page, source forms MUST be omitted
  and reported.

**Conversion service**

- **FR-026**: The conversion MAY rely on an external AI service. Only the
  public content of the source page (its rendered appearance, markup, texts
  and image references) MAY be sent to it — never leads, consent records,
  other pages, Media library content, user accounts or credentials.
- **FR-027**: The system MUST enforce a global monthly spending cap for
  imports (the "global cap"), expressed in euros and changeable by
  administrators only. Months are calendar months (Europe/Paris time).
- **FR-027a**: The system MUST record the cost of each import and show
  administrators the current month's running total against the global cap.
- **FR-027b**: *(merged into FR-027e.)*
- **FR-027c**: Budgets (the global cap and per-user budgets, FR-027d) MUST be
  checked only when a request is launched. Once launched, an import MUST run
  to its result — completed, or failed/cancelled for a reason unrelated to
  budget — even if its cost takes the user's or the workspace's monthly
  total past the limit; its full cost is recorded. No cost estimate is used
  to refuse a request in advance: a request is refused only if the relevant
  monthly total has already reached or passed the limit when it is launched.
  The overshoot is therefore limited to the imports in progress at that
  moment.
- **FR-027d**: Each user MUST have a user budget (monthly, in euros),
  editable by administrators only, in the admin interface (on the user's
  record). Users without their own value get the workspace default budget,
  itself set by administrators; a budget of 0 means the user cannot import.
  A user's monthly total is the sum of the costs of the imports they started
  that calendar month (Europe/Paris time).
- **FR-027e**: A new import MUST be refused, before any cost is incurred and
  without creating a page, when either the global monthly total has reached
  the global cap or the starting user's monthly total has reached their user
  budget. The plain-language message MUST say which limit was reached (the
  user budget, or the global cap) and when it resets (start of next month);
  the "import from a web page" option shows this upfront in the wizard.
- **FR-027f**: Administrators MUST be able to see, for the current month,
  each user's import spending against their budget, alongside the global
  total against the global cap. Editors see their own spending and budget
  in the wizard.
- **FR-028**: When the AI service is unavailable or refuses a request, the
  import MUST fail cleanly under FR-020 (no page created, plain-language
  reason), not fall back silently to a lower-quality result.

**Accessibility**

- **FR-029**: The import MUST NOT alter texts, colours or heading levels to
  correct accessibility issues; it reproduces the source faithfully.
- **FR-030**: The import report MUST list, as "to fix before publishing",
  every accessibility issue it detects on the imported page: images without
  alternative text, text/background colour pairs below the contrast minimum,
  skipped heading levels, links or buttons without an accessible name.
- **FR-031**: Imports MUST NOT change the publish rules: publishing an
  imported page is neither blocked nor relaxed because of these issues.

**Feedback**

- **FR-018**: At the end of every import the system MUST show an import report
  in plain language listing: the address actually imported, what was
  reproduced, what was simplified, what was omitted and why, images that
  failed, font substitutions, accessibility issues (FR-030), per-device check
  results (FR-011c), and any action required before publishing.
- **FR-019**: The import report MUST remain available to the editor on the
  imported page until they dismiss it.
- **FR-020**: When an import fails, no page MUST be created, and the editor
  MUST see a plain-language reason and be able to retry with the same or a
  corrected address.
- **FR-021**: An import MUST finish or fail within a bounded time; it MUST
  never leave the editor waiting indefinitely.

### Key Entities *(include if feature involves data)*

- **Import request**: a single attempt to import one address — who started it,
  the address given, the final address after redirects, chosen page type,
  status (queued, running, completed, failed, cancelled), current step, start
  and end time, and the cost it incurred (including for failed or cancelled
  imports).
- **Import report**: the outcome of one import request — reproduced elements,
  simplifications, omissions with reasons, failed images, font substitutions,
  accessibility issues, per-device check results, whether the source had its
  own mobile layout, required follow-up actions. Linked to the page it
  produced.
- **Import budget**: the global cap (monthly, in euros) and the default user
  budget, both changeable by administrators; the month's
  running total is the sum of the costs of that month's import requests.
- **User budget**: an optional per-user monthly amount in euros, set by
  administrators on the user's record; when empty the default user budget
  applies. The user's monthly total is the sum of the costs
  of the imports they started that month.
- **Imported image**: a Media library item created by an import; it is an
  ordinary Media library item in every respect, with its description taken
  from the source.
- **Page** (existing): the draft created by a completed import; indistinguishable
  from a page created from a starter template.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A typical landing page (up to 15 sections and 30 images) is
  turned into an editable draft in under 2 minutes from the moment the editor
  confirms the address.
- **SC-002**: On a reference set of 10 varied public landing pages, a reviewer
  comparing source and import side by side judges at least 8 to be "clearly
  the same page" (same section order, same texts, same images, similar
  colours and proportions) at desktop width, and at least 8 to be so at
  mobile width (390px) as well.
- **SC-003**: 100% of the elements of an imported page belong to the editor's
  block library (including Section and Columns), and publishing an imported page removes nothing that the
  editor canvas showed.
- **SC-004**: 100% of images shown on an imported page come from the Media
  library; zero references to the source website's images remain.
- **SC-005**: Zero imported elements are locked or non-selectable: an editor
  can change any text, image or button of an imported page with the same
  actions they use on a hand-built page.
- **SC-006**: Bringing an imported page to publishable quality takes an editor
  under 15 minutes of adjustments, versus the one to two hours a manual rebuild
  takes today.
- **SC-007**: Every failed or partial import ends with a message a
  non-engineer understands; no import ends silently or without a report.
- **SC-008**: Monthly import spending never exceeds the administrator-set
  global cap, and no user's monthly spending exceeds their budget, by more
  than the cost of the imports that were already running when the limit was
  reached.
- **SC-009**: On the same reference set, imported pages show zero horizontal
  scrolling and zero text below 14px at any device width after the editor has
  applied the fixes the report lists, and at least 7 of 10 need no mobile fix
  at all.

## Assumptions

- The feature is used to migrate or reproduce pages the organisation owns or
  has the right to reuse (texts and images). The product does not verify
  rights; the editor is responsible, as when uploading any image today.
- Fidelity is judged at desktop and mobile widths. The tablet rendering is
  reproduced but not scored separately; Mobile landscape follows the Tablet
  adjustments. Device breakpoints are the editor's existing ones (unchanged by
  this feature).
- Only one address, one page per import. Source pages behind a login, a
  paywall or bot protection are out of scope and reported as not importable.
- Visible content after the page finishes loading is what counts; content
  revealed only by interaction (clicking tabs, opening accordions, scrolling
  a carousel) beyond its initial state is not imported.
- Images added to the Media library by an import stay there even if the
  editor later deletes the imported page, like any uploaded image.
- A cancelled import creates no page; images it had already added are
  removed from the Media library. Leaving the wizard is not cancelling.
- Texts are imported verbatim; no translation, rewriting or summarising —
  including by the AI service, whose output is checked against the source
  texts.
- A default global cap and a default user budget apply from the
  first deployment until an administrator changes them; their amounts are set
  during planning.
- The external AI service processes only content that is already public on
  the source website, so sending it raises no additional privacy concern
  beyond the service's own terms.
- Both editor roles (admin and editor) who can create pages can import.
- The existing Media library size limit per image (500 KB) and existing
  publish rules remain unchanged by this feature, apart from accepting the
  lead-form block inside Section and Columns.
- Section and Columns are the only new blocks; other recurring patterns
  (headers, footers, pricing tables, galleries) are composed from them rather
  than getting dedicated blocks.
