# The carousel block

User guide for Trefle admins and editors (feature 016). It explains how to
add a carousel to a page, fill its slides and set how it behaves. French
version: [carrousel.fr.md](carrousel.fr.md).

A carousel shows several contents in the same place, one after the other:
customer testimonials, a photo gallery, a series of arguments with an image
each. Every editor can use it, admins and non-admins alike.

## Adding a carousel

In the page editor, open the block library and:

- **drag** the **« Carrousel »** block where you want it;
- or **click** it: it is added right after the selected block (or at the end
  of the page if nothing is selected).

The carousel comes with **3 sample slides**, each with an image and a text
to replace.

## Filling the slides

The editor shows **one slide at a time**. The grey bar above it says which:
« Diapositive 2 / 4 » (slide 2 of 4).

Each slide is filled like a Section: drop the usual blocks into it (Image,
Text, Testimonial, Call-to-action button, Columns…) and edit them as
anywhere else.

Select the carousel (click its grey bar) to show its buttons in the toolbar:

| Button | Effect |
|---|---|
| **‹** and **›** | show the previous or next slide |
| **+** | add an empty slide after the one shown |

Select a slide (for example with the « parent » ↑ button from a block inside
it) to:

| Button | Effect |
|---|---|
| **←** and **→** | move it one step earlier or later |
| copy | duplicate it (the copy shows at once) |
| bin | delete it |

To reach a block in a hidden slide, open the layer manager and click it: the
carousel shows its slide.

**Limits:**
- **1 to 12 slides**: beyond 12, « + » and duplicate add nothing; the last
  slide cannot be deleted (delete the whole carousel instead);
- **no lead form in a carousel**: the form must stay visible without any
  visitor action. The editor refuses to drop it there, and publication is
  refused if it gets there anyway (for example through the « Code » view);
- **no carousel inside a carousel**.

## Setting the carousel up

Select the carousel, then open the **settings** (⚙ icon):

| Setting | Default | Effect |
|---|---|---|
| Carousel name | « Carrousel » | the name screen readers announce; give it a meaningful one, e.g. "Customer reviews" |
| Visible slides | 1 | 2 or 3 slides side by side on desktop; at most 2 on tablet, always 1 on phone |
| Autoplay | off | advances the carousel by itself |
| Interval (seconds) | 5 | delay between two slides, 3 to 10 seconds |
| Show arrows | on | the ‹ › buttons under the slides |
| Show dots | on | one dot per position, to jump straight to a slide |

With several visible slides there is one dot per scroll position, not per
slide: 5 slides with 3 visible give 3 dots.

Autoplay is off by default because it bothers some visitors. When you turn
it on, visitors get a pause button, and the carousel stops by itself when
the mouse hovers it, when it has keyboard focus, or as soon as the visitor
uses it.

## What visitors see

- The first slide, then the ‹ › arrows and the dots under the carousel.
  After the last slide, "next" goes back to the first.
- On a phone, a horizontal swipe changes slide; a vertical swipe scrolls the
  page as usual.
- With the keyboard, Tab reaches the carousel and then its buttons; the
  arrow keys move between slides.
- The carousel is as tall as its tallest slide, so the rest of the page does
  not move when the slide changes. A shorter slide therefore leaves space
  below it.
- Images of the following slides load after the rest of the page, so they do
  not slow it down.
- If the visitor asked their system to reduce motion, slides change without
  sliding and autoplay does not start.
- Without JavaScript, every slide stays reachable by scrolling the carousel
  horizontally.

## Carousels and imports

Page imports (URL or Penpot file) do not create carousel blocks yet. A
carousel on the source site is reproduced by its first slide (or the one
drawn, for Penpot), and the import report says so. You can then rebuild it
with this block.
