# Feature Specification: Custom code and direct HTML editing

**Feature Branch**: `014-custom-code-editing`

**Created**: 2026-09-30

**Status**: Draft

**Input**: User description: "Je me rends compte que l'édition de pages dans GrapesJS est trop « verrouillée ». Je voudrais pouvoir ajouter des javascripts. Je voudrais aussi pouvoir modifier le code html directement." Decisions taken with the operator: (A) page-level scripts (in the page head and at the end of the page), **admins only**; (B) a « Code » view in the page editor to read and edit the page's HTML and CSS directly, with a wider list of allowed HTML elements, while `<script>` and event-handler attributes stay forbidden in the page's own HTML; (C) a « Code personnalisé » block, placed anywhere in the page, able to hold HTML and script (widgets such as Calendly, a map, a video player), **admins only**, shipped with this feature.

## Context

Pages are built in the GrapesJS editor from a fixed library of blocks. At
publication, the renderer keeps only a short, fixed list of HTML elements and
attributes (feature 003, FR-003) and serves every page under a strict script
policy (feature 002): only the platform's own scripts may run. Both were
deliberate: page HTML is inserted as-is into the public page, so anything an
editor pastes could otherwise run in every visitor's browser.

In practice this is too tight. The operator cannot add a tracking pixel for
one campaign, embed a booking widget, a map or a video, or fix a layout by
editing the markup, and anything outside the allowed list is removed at
publication without any warning.

This feature opens those doors in a controlled way:

- **Running code** (scripts) is possible only in two admin-only places:
  the page's own script settings, and the « Code personnalisé » block.
- **Markup** becomes directly editable by every editor, with a much wider set
  of allowed elements, but still never runs code by itself.
- Nothing an editor writes is removed silently any more: they are told what
  will not be kept, before it happens.

The admin tool is on its own address, restricted to the operator's network;
published pages are on the public domains. Code added to a public page
therefore runs only for that page's visitors, never inside the admin tool.
This feature amends the script-policy decision of feature 002 (User Story 2,
FR-004) and the allow-list of feature 003 (FR-003); both specs get a pointer
to this one.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An admin adds tracking and third-party scripts to a page (Priority: P1)

An admin runs a paid campaign on a landing page and must install the ad
network's pixel, and a chat widget that a client requested. On the page they
open a « Scripts » section, paste the pixel snippet into « Dans l'en-tête de la
page » and the chat snippet into « En fin de page », and save. On the
published page, both scripts load and work: the pixel reports a page view to
the ad network, the chat bubble appears. Editors who open the same page do
not see the section and cannot change these snippets.

**Why this priority**: Tracking pixels and third-party widgets are the most
common reason the operator hits the lock today, and they cannot be added in
any other way. It is also the most sensitive part, so it defines the
permission model the other stories reuse.

**Independent Test**: As an admin, paste a script that writes a visible
marker into the page and a script loaded from an external address that calls
back to its own server; publish; open the public page: both run, the browser
reports no blocked script or blocked connection. Log in as an editor: the
« Scripts » section is absent and an attempt to change the scripts through any
other route is refused.

**Acceptance Scenarios**:

1. **Given** an admin editing a page, **When** they paste a snippet into
   « Dans l'en-tête de la page » and save, **Then** the published page
   carries its meta/link tags in the head and runs its scripts before any
   page content.
2. **Given** an admin editing a page, **When** they paste a snippet into
   « En fin de page » and save, **Then** the snippet is placed after the page
   content and its scripts run once the content is displayed.
3. **Given** a script that itself loads further scripts, contacts its own
   servers or shows an embedded frame (typical of ad pixels and chat
   widgets), **When** the page is visited, **Then** those follow-on loads,
   connections and frames are allowed.
4. **Given** an editor (non-admin) editing the same page, **When** the edit
   view opens, **Then** they see no « Scripts » section, and **When** they save
   the page, **Then** the admin's scripts are kept unchanged.
5. **Given** an editor attempting to set or change page scripts by any
   means other than the edit view, **When** the change is submitted, **Then**
   it is refused and the stored scripts are unchanged.
6. **Given** a page with scripts, **When** it is opened in the page editor,
   **Then** those scripts never run inside the admin tool.
7. **Given** a page with scripts, **When** it is duplicated or used to create
   an A/B test variant, **Then** the copy carries the same scripts.
8. **Given** a snippet left on its default « Nécessite le consentement
   cookies », **When** a visitor arrives without having chosen, **Then** it
   does not run; **When** they click « Accepter », **Then** it runs without
   a page reload; **When** they click « Refuser », **Then** it never runs.
9. **Given** a snippet marked « Essentiel », **When** any visitor arrives,
   **Then** it runs whatever their cookie choice.
10. **Given** a page on a domain with no cookie banner, **When** the admin
    opens the « Scripts » section, **Then** each consent-dependent snippet shows
    a warning that it will not run.

---

### User Story 2 - An editor edits the page's HTML and CSS directly (Priority: P1)

An editor wants a two-column table of prices and a real button that the block
library does not offer, and wants to fix a margin that is hard to reach with
the style panel. In the page editor they click « Code », see the page's HTML
and CSS, edit them, and click « Appliquer ». The canvas updates with their
changes, which they can keep editing visually. If they wrote something the
published page will not keep (a `<script>` tag, an `onclick` attribute, an
element outside the allowed list), the « Code » view tells them what will be
dropped before they apply, and points admins to the « Code personnalisé »
block for scripts.

**Why this priority**: It is the second explicit request and benefits every
editor, not only admins. It carries no script risk, since the page's own
markup still never runs code.

**Independent Test**: Open « Code », add a table, a `<button>`, a `<video>`
and an `<iframe>` embed, change a CSS rule, apply, save and publish: all
appear on the public page. Add an `onclick` attribute and a `<script>` tag:
the « Code » view lists both as dropped before applying, and neither reaches
the public page.

**Acceptance Scenarios**:

1. **Given** a page open in the editor, **When** the editor clicks « Code »,
   **Then** they see the page's current HTML and CSS, in editable form, as
   they will be published.
2. **Given** edited HTML and CSS, **When** the editor clicks « Appliquer »,
   **Then** the canvas shows the edited page and the change can be undone
   from the editor like any other edit.
3. **Given** the editor cancels or closes the « Code » view, **When** they
   return to the canvas, **Then** the page is unchanged.
4. **Given** edited HTML that keeps the lead-form placeholder, sections and
   columns, **When** applied, **Then** they are still recognised as such:
   the form stays a single non-editable placeholder, sections and columns
   keep their editor behaviour, and the page can still be published.
5. **Given** edited HTML that removes the lead-form placeholder or adds a
   second one, **When** the editor tries to publish, **Then** publication is
   refused with the same message as today.
6. **Given** edited HTML containing elements or attributes that the public
   page will not keep, **When** the editor is about to apply, **Then** the
   « Code » view lists them in plain language, and the editor can go back
   and fix them or apply anyway.
7. **Given** HTML using any element of the widened allowed list (see FR-011),
   **When** the page is published, **Then** that element reaches the public
   page intact with its allowed attributes.
8. **Given** HTML that cannot be read (for example badly broken markup),
   **When** the editor applies it, **Then** the editor shows what it
   understood, and nothing is saved until the editor saves the page.

---

### User Story 3 - An admin places a code widget at a precise spot in the page (Priority: P2)

An admin needs a Calendly booking widget between the testimonials and the
form, and a map in the contact section. They drag the « Code personnalisé »
block to that spot, open it, paste the widget's embed code (HTML plus
script), and save. In the editor the block shows as a clearly labelled
placeholder (never the live widget). On the published page, the widget
appears exactly at that spot and works. Editors see the block, can move or
delete it, but cannot add one, nor view or change its code.

**Why this priority**: Page-level scripts (Story 1) already cover pixels and
floating widgets; this story adds positioned embeds. It depends on the
permission model and script handling of Story 1.

**Independent Test**: As an admin, drop the block inside a column, paste an
embed that renders a visible element and runs a script that changes it;
publish: the element appears inside that column and the script has run. As
an editor: the block is absent from the library, its code is not viewable
or editable, it can be moved, and saving the page keeps its code unchanged.

**Acceptance Scenarios**:

1. **Given** an admin in the page editor, **When** they drop « Code
   personnalisé » and enter HTML with script, **Then** after saving, the
   published page shows that HTML at the block's position and runs its
   scripts.
2. **Given** a page with a code block, **When** it is shown in the editor,
   **Then** the block appears as a labelled placeholder, and its scripts and
   embedded content do not run inside the admin tool.
3. **Given** an editor (non-admin), **When** they open the block library,
   **Then** « Code personnalisé » is not offered; **When** they select an
   existing code block, **Then** they can move or delete it but cannot open
   or change its code.
4. **Given** an editor who pastes, through the « Code » view or any other
   route, markup that would create a new code block or change an existing
   one's content, **When** the page is saved, **Then** the save is refused
   with a message explaining that only an admin can change custom code, and
   the stored page is unchanged.
5. **Given** several code blocks on one page, **When** it is published,
   **Then** each renders at its own position, in page order.
6. **Given** a code block placed inside a section or a column, **When** the
   page is shown on a narrow screen, **Then** the block follows that
   section's or column's layout like any other block.

---

### Edge Cases

- An admin pastes a snippet with a syntax error or a script that fails at
  run time: the page still displays and the lead form still works; the error
  stays confined to that script.
- A snippet contains no `<script>` at all (for example a tracking `<img>`
  or a `<noscript>` fallback): it is inserted as given.
- A snippet or code block is very large: saving is refused above a documented
  size, with a message giving the limit.
- An admin downgrades to editor, or leaves: scripts and code blocks they
  added stay on the page, unchanged, until an admin edits them.
- A consent-dependent script and a visitor who has not chosen yet: it waits
  for « Accepter » and never runs on « Refuser » (FR-008). A booking widget
  left on the default setting stays hidden for visitors who refuse; the
  admin marks it « Essentiel » if it sets no tracking cookies.
- Code pasted into a page-level snippet or a code block that tries to reach
  the admin tool: it runs only on the public domain, which carries no admin
  session, so it has no access to it.
- The « Code » view is used on a page that contains code blocks: code blocks
  appear there as their placeholder markers, not as their content. An editor
  who leaves the markers untouched keeps the blocks.
- A page imported from a URL (feature 012/013): its import still produces
  only safe markup; scripts of the source page are never imported as
  scripts.
- The preview of an unpublished page runs the page's scripts and code
  blocks like the published page, so an admin can check them before
  publishing.

## Requirements *(mandatory)*

### Functional Requirements

**Page scripts (Story 1)**

- **FR-001**: A page MUST have two optional script settings: « Dans
  l'en-tête de la page » (its meta and link tags go in the page head, its scripts run before any page content) and « En fin de page »
  (inserted after the page content). Each holds a snippet of HTML that may
  include `<script>` and `<noscript>` elements.
- **FR-002**: Only admins MUST be able to see, set or change page scripts.
  For editors the settings are hidden in the edit view, and any attempt to
  change them through any other route MUST be refused; saving a page as an
  editor MUST leave existing scripts unchanged.
- **FR-003**: On the public page, every script from these snippets MUST run,
  including scripts loaded from external addresses, and the scripts they
  load in turn.
- **FR-004**: The public page's script policy MUST allow connections, frames
  and images from external addresses so that third-party pixels and widgets
  work. Scripts written directly into the page's own markup MUST still never
  run.
- **FR-005**: Scripts MUST never run inside the admin tool, neither from page
  settings nor from code blocks.
- **FR-006**: Scripts MUST be copied when a page is duplicated or used to
  create an A/B test variant.
- **FR-007**: Scripts MUST apply to the page's preview as well as to its
  published version.
- **FR-008**: Each page-script snippet and each code block MUST carry a
  consent setting chosen by the admin: « Nécessite le consentement cookies »
  (the default, for trackers and pixels) or « Essentiel » (for functional
  widgets). A snippet that needs consent MUST run only once the visitor has
  accepted cookies on the domain's banner (feature 007): immediately on
  load when they accepted earlier, as soon as they click « Accepter »
  otherwise, never when they refused or have not chosen. An « Essentiel »
  snippet runs on every visit.
- **FR-008a**: When a visitor who had accepted later changes their choice
  to « Refuser », consent-dependent snippets MUST no longer run from their
  next page load onward.
- **FR-008b**: When the page's domain has no cookie-consent banner enabled,
  consent-dependent snippets MUST NOT run (the visitor has no way to accept),
  and the admin MUST see a warning next to each such snippet explaining it
  and suggesting either enabling the banner or marking the snippet
  « Essentiel ».
- **FR-008c**: A consent-dependent code block that has not run MUST leave no
  visible gap or broken element in the page; the block's position stays
  empty until it runs.

**Direct HTML and CSS editing (Story 2)**

- **FR-009**: The page editor MUST offer a « Code » view, available to every
  editor, showing the page's HTML and CSS as they will be published, both
  editable, with « Appliquer » and « Annuler ».
- **FR-010**: Applying MUST replace the page content and styles with the
  edited version, be undoable from the editor, and preserve the recognition
  of the lead-form placeholder, sections, columns and code blocks, so the
  existing publish guard and block counting keep working unchanged.
- **FR-011**: The published-page allowed list MUST be widened to include at
  least: tables (`table`, `thead`, `tbody`, `tfoot`, `tr`, `th`, `td`,
  `caption`, `colgroup`, `col`), `button`, `hr`, `small`, `sub`, `sup`,
  `mark`, `code`, `pre`, `kbd`, `abbr`, `cite`, `q`, `time`, `dl`, `dt`,
  `dd`, `header`, `footer`, `nav`, `main`, `article`, `aside`, `details`,
  `summary`, `picture`, `source`, `video`, `audio`, `track`, `iframe`, and
  inline `svg` with its drawing elements; plus the attributes these need
  (for example dimensions, `colspan`/`rowspan`, media `controls`/`poster`/
  `autoplay`/`muted`/`loop`/`playsinline`, `srcset`/`sizes`/`media`/`type`,
  `iframe` `allow`/`allowfullscreen`/`loading`/`referrerpolicy`, `role`
  and `aria-*`).
- **FR-012**: The page's own markup MUST still never carry running code:
  `<script>`, event-handler attributes (`on…`), `javascript:` addresses and
  equivalent constructs MUST be removed at publication, as today.
- **FR-013**: `<form>` and form inputs other than the platform's lead form
  MUST remain excluded from the page markup, so every lead still goes
  through the secured lead-capture path.
- **FR-014**: Before applying, the « Code » view MUST list, in plain French,
  every element and attribute that publication will drop, and let the editor
  go back or apply anyway. For scripts, the message MUST point to page
  scripts / the code block and say that they are admin-only.
- **FR-015**: The same allowed list MUST be used by publication, by the
  « Code » view's warning, and by the page-import tests (feature 012,
  FR-008), so the three can never disagree.

**Code block (Story 3)**

- **FR-016**: The block library MUST offer a « Code personnalisé » block,
  to admins only, that can be placed anywhere a content block can go
  (including inside a section or a column) and holds a snippet of HTML that
  may include scripts.
- **FR-017**: Only admins MUST be able to create a code block, or view or
  change its content. Editors MAY move or delete an existing code block.
- **FR-018**: A save by a non-admin that would add a code block or change a
  code block's content, by any route, MUST be refused with a message
  explaining that only an admin can change custom code; the stored page
  MUST be unchanged.
- **FR-019**: In the editor, a code block MUST appear as a labelled
  placeholder and MUST NOT display or run its content.
- **FR-020**: On the public page and in preview, each code block's content
  MUST be rendered at the block's position and its scripts MUST run, under
  the same rules as FR-003.

**Common**

- **FR-021**: A page-script snippet and a code block's content MUST each be
  limited in size (default: 50 000 characters each); saving above the limit
  MUST be refused with a message giving the limit.
- **FR-022**: A script that fails MUST NOT prevent the rest of the page, and
  the lead form, from displaying and working.
- **FR-023**: Each change to page scripts or to a code block's content MUST
  be recorded in the page's activity history with who made it and when.

### Key Entities

- **Page scripts**: two optional snippets attached to a page (head, end of
  page), each with its consent setting (« Nécessite le consentement
  cookies » by default, or « Essentiel »), admin-editable only, copied with
  the page.
- **Code block**: a block in the page content, with a position like any
  other block, an admin-editable snippet and its consent setting; shown as
  a placeholder in the editor, rendered live on the public page.
- **Allowed list**: the single list of elements and attributes that
  published page markup may contain; shared by publication, the « Code »
  view warning and the import tests.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can install a third-party pixel or chat widget on a
  page, from pasting the vendor's snippet to seeing it work on the public
  page, in under 3 minutes and without any developer involvement.
- **SC-002**: The vendor snippets of at least five common tools (an ad
  pixel, an analytics tag, a chat widget, a booking widget, a video
  embed) work unmodified on a published page, with no blocked script,
  connection or frame reported by the browser.
- **SC-003**: 100% of attempts by an editor to set or change page scripts
  or code-block content, by any route, are refused (verified by automated
  tests covering the edit view, direct data submissions and the « Code »
  view).
- **SC-004**: No script from a page runs in the admin tool (verified by an
  automated check on a page containing scripts and code blocks).
- **SC-005**: Every element or attribute dropped at publication from
  editor-written markup was listed to the editor beforehand; zero silent
  removals in the automated test set.
- **SC-006**: Published pages that use none of the new features render
  identically before and after this feature, and all existing pages still
  pass the publish guard.
- **SC-007**: A published page with scripts still shows its content and its
  working lead form when one of its scripts fails or is blocked by the
  visitor's browser.
- **SC-008**: 0 consent-dependent snippet runs for a visitor who has
  refused or not yet chosen, in the automated test set; 100% run within a
  second of the visitor clicking « Accepter », without a page reload.

## Assumptions

- Admins are trusted operators; the risk this feature accepts is that an
  admin's own code runs for the page's visitors. It is limited by the admin
  tool's separate, network-restricted address and by the absence of any
  admin session on public domains.
- Editors are trusted to write markup but not code; the widened allowed list
  is judged safe to publish from any editor.
- Scripts are per page. Site-wide or per-domain scripts are out of scope:
  the domain's tag manager (feature 007) already covers site-wide tags.
- The « Code » view edits with syntax colouring, line numbers,
  auto-indent and on-demand formatting (operator feedback, 2026-09-30:
  plain text areas were too uncomfortable). No validation, autocompletion
  or auto-closing of tags is required.
- Scripts and code blocks are not checked for content (no malware scanning,
  no vendor allow-list); the admin is responsible for what they paste.
- The client-side weight budget of published pages (constitution, principle
  V) does not count third-party scripts an admin adds; the platform's own
  weight is unchanged.
- The lead form keeps working without JavaScript (constitution, principle
  V); custom scripts may enhance a page but must not be required by it.
- Imported pages (features 012/013) keep producing only safe markup; import
  never creates scripts or code blocks.
