# Feature Specification: Carousel block

**Feature Branch**: `016-carousel-block`

**Created**: 2026-10-07

**Status**: Draft

**Input**: User description: "Ajout d'un module Carrousel dans GrapesJS". Context: feature 015 decided (RESUME, 2026-10-07) that a real Trefle carousel block would be a separate feature; until then, imported carousels keep only the slide drawn and are reported as « Simplifié ».

## Context

Pages are built in the editor from a fixed library of blocks (Hero, Texte,
Image, Bouton d'action, Formulaire, Témoignage, Section, Colonnes, and the
admin-only Code personnalisé). None of them can show several items in turn in
the same place. Landing pages use that pattern constantly: a row of client
testimonials, a photo gallery of a venue or of dishes, a sequence of
arguments with a picture each.

Today an editor who wants one has two bad options: stack every item one under
the other (long pages, the point of the design is lost), or ask an admin for a
« Code personnalisé » block with a third-party slider script (admin-only, runs
only on the published page, cannot be edited visually, and loads external
code). Page imports hit the same gap: the URL import (012) and the Penpot
import (015) keep only the first or visible slide of a carousel and report the
rest as simplified or omitted.

This feature adds a « Carrousel » block to the library, available to every
editor, whose slides are edited visually like any other part of the page.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An editor builds a carousel and visitors browse it (Priority: P1)

An editor is building a caterer's landing page and wants to show five client
testimonials, each with a photo, a quote and a name, in one band of the page.
They add the « Carrousel » block: it arrives with three example slides. In each
slide they place the content they want, using the usual blocks (Image, Texte,
Témoignage, Bouton d'action…) and the usual styling tools. They add two more
slides, reorder one, delete none, and publish. On the published page the
visitor sees one testimonial at a time and moves between them with
« précédent / suivant » arrows, with dots showing where they are (and letting
them jump to a slide), or by swiping on a phone.

**Why this priority**: This is the feature. Without it nothing else in this
spec has a purpose; with it alone, editors already get the pattern they ask
for.

**Independent Test**: In the editor, add a Carrousel, put different content
in each of 4 slides, add/move/delete a slide, save and publish. On the public
page, with a mouse, a touch screen and the keyboard, reach every slide in both
directions; check that each slide shows exactly what was built in the editor.

**Acceptance Scenarios**:

1. **Given** an editor on a page, **When** they add the « Carrousel » block
   (drag-and-drop, or a click that adds it after the selected block),
   **Then** a carousel with 3 example slides appears, the first one shown.
2. **Given** a carousel in the editor, **When** the editor uses its controls,
   **Then** they can show any slide, add a new empty slide, duplicate a slide,
   delete a slide and move a slide before or after another.
3. **Given** a slide shown in the editor, **When** the editor drops blocks into
   it or edits its texts, images and styles, **Then** it behaves exactly like
   editing a Section: the same blocks and tools are available, except those
   listed in FR-007.
4. **Given** a component inside a slide that is not shown, **When** the editor
   selects it from the layer list, **Then** the carousel switches to that
   slide so the selection is visible.
5. **Given** a published page with a 5-slide carousel, **When** a visitor uses
   the « suivant » arrow on the last slide, **Then** the carousel goes back to
   the first slide (and « précédent » on the first slide goes to the last).
6. **Given** a published page viewed on a phone, **When** the visitor swipes
   horizontally on the carousel, **Then** it moves to the next or previous
   slide, and a vertical swipe still scrolls the page.
7. **Given** a published carousel, **When** the visitor activates the dot for
   slide 4, **Then** slide 4 is shown and its dot is marked as current.

---

### User Story 2 - Every visitor can use it, whatever their device or needs (Priority: P2)

A visitor who navigates with the keyboard, one who uses a screen reader, one
who has asked their system to reduce motion, and one on a slow phone whose
scripts fail to load all reach every slide and are never trapped or disturbed
by it.

**Why this priority**: Carousels are a known accessibility and performance
trap. Trefle publishes pages for clients who are judged on lead conversion and
must meet accessibility expectations; the block must not lower the quality of
the pages it is added to. It is P2 only because it refines the block of
User Story 1 rather than adding a capability.

**Independent Test**: On a published page with a carousel: reach and operate
every control with the keyboard alone; listen to it with a screen reader;
turn on « reduce motion »; disable scripts; run the automated accessibility
check used on published pages.

**Acceptance Scenarios**:

1. **Given** a keyboard user, **When** they tab through the page, **Then** they
   reach the arrows and dots in a logical order, see a visible focus, operate
   them with Enter/Space, and only the shown slide's links and buttons receive
   focus.
2. **Given** a screen-reader user, **When** they reach the carousel, **Then** it
   is announced as a carousel with a name, each slide as « Diapositive N sur
   M », and a slide change triggered by the user is announced.
3. **Given** a visitor whose system asks for reduced motion, **When** slides
   change, **Then** they change without a sliding animation.
4. **Given** a visitor for whom the page's scripts do not run, **When** they
   view the carousel, **Then** every slide is still reachable (by scrolling the
   carousel sideways) and no content is hidden for good.
5. **Given** a carousel whose slides contain images, **When** the page loads,
   **Then** only the images of the slide(s) shown first are loaded right away;
   the others load before they are shown, without the visitor waiting on a
   blank slide.
6. **Given** slides of different heights, **When** the visitor moves between
   them, **Then** the content below the carousel does not jump.

---

### User Story 3 - The editor tunes how the carousel behaves (Priority: P3)

For a logo strip the editor wants three logos visible at once on a computer
and an automatic rotation; for a gallery they want no dots. They set these
options on the selected carousel in the editor's settings panel.

**Why this priority**: Useful variations of the same block, but the default
carousel of User Story 1 already covers the common need.

**Independent Test**: On one carousel, set 3 slides visible on large screens,
turn on automatic rotation every 5 seconds, hide the dots; publish; check on a
computer, a tablet and a phone.

**Acceptance Scenarios**:

1. **Given** a selected carousel, **When** the editor sets « Diapositives
   visibles » to 2 or 3, **Then** on large screens that many slides are shown
   side by side and move one at a time; on a phone, one slide is shown. The
   dots then stand for scroll positions, not slides (5 slides, 3 visible →
   3 dots).
2. **Given** a carousel with « Défilement automatique » on, **When** the page is
   viewed, **Then** it moves to the next slide every chosen interval (between 3
   and 10 seconds), shows a visible « pause » control, and stops while the
   pointer is over it, while focus is inside it, after the visitor uses any of
   its controls, and never starts when the visitor asks for reduced motion.
3. **Given** a selected carousel, **When** the editor hides the arrows or the
   dots, **Then** the published carousel shows neither, and is still reachable
   by swipe, keyboard and assistive technologies.
4. **Given** a carousel, **When** no setting was changed, **Then** it shows one
   slide at a time, with arrows and dots, and no automatic rotation.

---

### Edge Cases

- **One slide**: arrows, dots and automatic rotation are not shown; the slide
  displays like a plain section.
- **Last slide deleted**: deleting the only remaining slide is refused; the
  editor deletes the whole carousel instead.
- **Many slides**: a carousel holds at most 12 slides; at 12, « ajouter » and
  « dupliquer » add nothing and the editor is told why (« 12 diapositives
  maximum »).
- **Empty slide**: an empty slide is shown in the editor with a drop hint; on
  the published page it is kept (an empty slide is the editor's choice), and
  the page's pre-publication checks do not block on it.
- **Lead form inside a slide**: not allowed (FR-007) — the lead form must stay
  visible to every visitor without interaction.
- **Carousel inside a carousel**: not allowed in the editor; if one is
  written in the « Code » view anyway, the inner one is shown as plain
  stacked content, never as a second carousel.
- **« Code personnalisé » inside a slide**: allowed; its code only runs on the
  published page, as anywhere else.
- **Several carousels on one page**: each works on its own; their controls and
  announcements do not interfere.
- **HTML edited in the « Code » view** (014): a carousel written or re-parsed
  from HTML comes back as a carousel with its slides and settings, not as
  plain boxes.
- **A/B test variants** (008): a carousel in a variant behaves the same as in
  the main page.
- **Page saved before this feature**: unchanged; nothing is converted.

## Requirements *(mandatory)*

### Functional Requirements

**Editor**

- **FR-001**: The block library MUST offer a « Carrousel » block to every
  editor (admins and non-admins), added by drag-and-drop or by a click that
  places it after the selected block (never inside a slide).
- **FR-002**: A new carousel MUST arrive with 3 example slides, each holding
  placeholder content (an image and a short text) so the editor sees at once
  what the block does.
- **FR-003**: In the editor, a carousel MUST show one slide at a time, with
  controls to show the previous/next slide or a given slide, and to add,
  duplicate, delete and move the current slide one place earlier or later.
  These controls MUST be part of the editor only, never of the published
  page.
- **FR-004**: Each slide MUST accept the same blocks and editing tools as a
  Section, except those excluded by FR-007.
- **FR-005**: Selecting, from the layer list or otherwise, a component that
  sits in a slide not shown MUST bring that slide into view.
- **FR-006**: A carousel MUST hold between 1 and 12 slides (Edge Cases).
- **FR-007**: The lead-form block and another carousel MUST NOT be placed
  inside a slide; an attempt is refused, as other forbidden drops are today.
- **FR-008**: The selected carousel's settings panel MUST offer: slides
  visible at once on large screens (1, 2 or 3; default 1), automatic rotation
  (off by default) with its interval (3 to 10 seconds; default 5), show arrows
  (default on), show dots (default on), and an accessible name for the
  carousel (default « Carrousel »).
- **FR-009**: A carousel MUST keep its type, slides and settings when the page
  is saved and reopened, when its HTML is edited in the « Code » view, and
  when a page is duplicated.

**Published page**

- **FR-010**: A published carousel MUST show its slides as built in the
  editor, the first slide first, and let visitors move between slides with
  arrows, dots, horizontal swipe and the keyboard; moving past the last slide
  goes to the first and vice versa.
- **FR-011**: A carousel MUST stay usable when the page's scripts do not run:
  all slides reachable by scrolling it sideways (FR-010's controls may then be
  missing).
- **FR-012**: A carousel MUST meet the accessibility requirements of User
  Story 2: named carousel region, slides announced « Diapositive N sur M »,
  user-triggered changes announced, controls with French accessible labels
  and visible focus, content of hidden slides out of the focus order, the
  sliding area itself reachable and scrollable with the keyboard (even when
  no slide holds a link or button, and without scripts), no animation under
  reduced motion.
- **FR-013**: Automatic rotation, when on, MUST provide a pause/play control
  and stop as described in User Story 3, scenario 2; it MUST never run under
  reduced motion.
- **FR-014**: The carousel's height MUST NOT change when slides change (the
  tallest slide sets it), so the page below does not move.
- **FR-015**: Images in slides not shown at load MUST NOT delay the page's
  first display.
- **FR-016**: The published carousel MUST NOT load any third-party code and
  MUST work under the published pages' existing script policy and HTML
  allow-list, unchanged.

**Imports**

- **FR-017**: Out of scope for this feature: the URL import (012) and Penpot
  import (015) keep their current behaviour for carousels (first or visible
  slide kept, reported). Turning detected carousels into this block is a
  follow-up.

### Key Entities

- **Carousel**: a block of the page. Has an accessible name, slides visible
  at once on large screens, automatic rotation on/off and its interval, arrows
  shown, dots shown. Holds 1–12 slides, in order.
- **Slide**: an ordered part of a carousel. Holds any allowed blocks, like a
  Section. Has no settings of its own.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An editor who has never used the block builds a 4-slide carousel
  with different content in each slide, and publishes it, in under 5 minutes
  without help.
- **SC-002**: On the published page, every slide is reachable in both
  directions with each of: a mouse, a touch screen, the keyboard alone, a
  screen reader, and with scripts disabled.
- **SC-003**: The automated accessibility check run on published pages reports
  no new violation on a page after a carousel is added.
- **SC-004**: Adding a carousel of 6 image slides to a page delays its first
  display by no more than 10% compared with the same page with only the first
  slide's image.
- **SC-005**: Moving between slides moves nothing else on the page (no
  visible shift of the content below).
- **SC-006**: 100 % of carousels saved, reopened, and round-tripped through
  the « Code » view come back with the same slides, order and settings.

## Assumptions

- Slides hold any content, not only images: testimonials, galleries and
  « image + text + button » sequences are all common on landing pages, and
  one generic block serves them all (decision taken by default; an
  image-only gallery would be a narrower variant).
- The block is available to every editor, not only admins: it publishes no
  code of its own beyond the platform's, so it carries no more risk than the
  existing blocks.
- Automatic rotation is off by default, per common accessibility guidance;
  the editor opts in.
- The carousel's own look (arrow and dot colours, sizes) uses a neutral
  default that suits light and dark backgrounds and can be restyled with the
  editor's existing style tools; no theme system is added.
- Turning imported carousels into this block (012, 015) is a separate,
  later change (FR-017).
- The platform's published-page script policy (002, amended by 014) is not
  changed: the carousel's behaviour ships as part of the platform's own code.
