# Importing a Penpot site

User guide for Trefle admins and editors (feature 015). It explains how to
prepare a file in Penpot, import it into Trefle, and what to review before
publishing the pages it creates. It also covers domain fonts, which the
import fills in. French version: [import-penpot.fr.md](import-penpot.fr.md).

The admin interface is in French; button and section names are given as they
appear on screen, with a translation.

## In short

- Each **board** of a Penpot page becomes a Trefle **draft page**, made of
  blocks you can edit in the editor. Nothing is published automatically.
- Prototype links between boards become real links between the pages.
- The file's images go to the media library. Google fonts are added to the
  domain and served by Trefle, never by Google.
- The import costs nothing (no AI) and takes a few seconds.
- It never changes an existing page: a new import creates new drafts.

## Who can do what

| Action | Admin | Editor |
|---|---|---|
| Import a Penpot site | ✅ | ✅ |
| Cancel their own import | ✅ | ✅ |
| Start or cancel another user's import | ✅ | ❌ |
| Manage domain fonts by hand | ✅ | ❌ |

The **« Importer un site Penpot »** (import a Penpot site) button appears
above the page list, and on the page of an active domain. If it does not,
the feature is not enabled on this installation (see "For administrators" at
the end).

## Preparing the file in Penpot

### One Penpot page, one board per site page

- Put the site's pages on **one Penpot page** (for example "Site"). The
  file's other pages (components, drafts) are ignored unless you pick them.
- Each **top-level board** of that page becomes a page. Boards are offered
  in reading order: top to bottom, then left to right.
- **Name the boards** like the pages: the name becomes the page's public
  title ("Home", "About"…) and is used to suggest its address (`/about`). The
  first board is suggested as `/`.
- **At most 10 pages per import.** For a larger site, run several imports.

### Layout: flex and grid

- Boards and frames with **flex or grid layout** are reproduced with their
  gaps, alignment and sizes, and **adapt to mobile** (rows stack, margins
  shrink).
- **Freely positioned** content (no flex or grid) is reproduced exactly on
  desktop, but only **scaled down** on mobile, which quickly makes it
  unreadable. The report flags it; when it is the whole board, it asks for
  it as an action before publishing.
- Texts with **auto width** stay on one line as long as there is room, as in
  Penpot.
- **Hidden** layers are not imported.

### Texts and fonts

- Texts are kept **word for word**, with their font, size, weight, colour,
  line height and letter spacing.
- **Google fonts** (and Penpot's default font, "Source Sans 3") are added to
  the domain's fonts. A font that Google does not have is replaced by a close
  system font (serif, sans-serif or monospace), and the report says so.
- Heading levels come from Penpot **text styles** (typographies): a text
  using a style named "H1", "Heading 2", "Titre 3"… gets that level. Without
  such a style, the largest text of the board becomes the **main heading**
  (`h1`) and the next large texts become subheadings. Each page has exactly
  one main heading.

### Images and icons

- Images (image fills) are saved to the **media library** as WebP. An image
  whose layer has a meaningful name ("Team photo") gets that name as its
  alternative text. Otherwise it is marked **« À décrire »** (to describe)
  and the report asks you to describe it before publishing.
- Icons and vector shapes become inline SVG.

### Links (prototype)

In Penpot's Prototype mode, on an element:

- **"Navigate to" a board, on click**: becomes a link to the page created
  for that board, at the address chosen in the wizard. If that board is not
  imported, the link is not created and the report lists it.
- **"Open URL", on click**: becomes a link. Only `https:`, `http:`,
  `mailto:` and `tel:` are accepted.
- Other interactions (hover, overlays, "Back", delays) are not kept. The
  report lists them.

### What is not reproduced as is

- **Carousels**: Penpot has none. The visible slide is reproduced as drawn,
  without scrolling, and the report says so. You can rebuild it with the
  carousel block (see [The carousel block](carousel.md)).
- **Colours** are never changed. Insufficient contrast in the design is
  flagged in the report's « Accessibilité » section; fixing it is your call.
- **Mobile boards**: if your file also has mobile versions of the pages, do
  not tick them. Trefle adapts the desktop version to phones itself.
- Masks, blend modes and rotation are simplified, and the report says so.

### Exporting the file

In Penpot: file menu › **Export** › **.penpot file**. Export the file alone,
**without its libraries**. It must come from Penpot 2 and weigh **100 MB at
most** (lighten the images if needed).

## Importing into Trefle

Click **« Importer un site Penpot »** (page list, or the domain's page). The
wizard has four steps.

1. **Domain**: choose the site's domain. Pages are created as drafts on this
   domain. It cannot be changed once the file has been analysed. From a
   domain's page, this step is already filled.
2. **File**: drop the `.penpot` file (or click to choose it). Trefle analyses
   it in a few seconds.
3. **Pages**:
   - if the file has several Penpot pages, choose the site's one;
   - tick the boards to import (the first 10 are ticked);
   - check each page's **address**: no spaces, `?` or `#`. The address
     `/confirmation` is reserved. Two pages cannot share an address;
   - **« Déjà publiée sur ce domaine »** (already published on this domain)
     marks an address already used by a published page. The import is
     possible, but the draft can only be published at another address, or
     after unpublishing the other page;
   - choose the pages' **language** (pre-filled with the domain's);
   - click **« Importer N pages »**.
4. **Import**: progress is shown (reading, fonts, images, building, checking
   screen sizes, saving). You can **cancel**: no page or image is then kept.
   You can also leave the page; the import goes on. At the end, the drafts
   created are listed with a link to each.

Every import is listed in **Content › Imports de sites Penpot**, with its
pages. The uploaded file is deleted as soon as the import ends. An analysis
that is never started is dropped after one hour.

## After the import: review, then publish

### The drafts

- Their **name in the admin** is `<board>_<date>_<time>`, for example
  `Home_2026-10-07_14h32`. Rename them if you like.
- Their **public title** (SEO) is the board's name.
- They are ordinary « Libre » (free) pages: everything can be edited block by
  block in the editor, including in the « Code » view.

### The import report

At the top of each imported draft, the **import report** lists:

- **To do before publishing**: for example describing images, or adapting
  a freely positioned page to mobile;
- **Simplified**: what was reproduced more simply (carousel, free
  positioning, fonts added to the domain…);
- **Not kept**: interactions and links that could not be created;
- **Images not retrieved**: replaced by a neutral image to change;
- **Fonts replaced** by a system font;
- **Accessibility**: insufficient contrast, heading levels;
- **Screen sizes**: problems seen on desktop, tablet and mobile, grouped by
  type.

« Masquer le rapport » (hide) folds it, in your browser only. « Supprimer le
rapport » (delete) removes it for everyone, for good.

### Publishing

Review the page on desktop and mobile (editor previews), do the requested
actions, then publish it like a hand-made page.

### Importing a new version of the file

A new import of the same file **creates new drafts** next to the old ones.
It never changes, unpublishes or deletes an existing page. To replace a
published page with its new version, unpublish the old one (or change its
address), then publish the new one.

## Domain fonts

On a domain's page (admins), the **« Polices du domaine »** (domain fonts)
section lists the Google fonts available to every page of the domain.

- **Add a font**: its exact Google Fonts name (for example "Inter Tight"),
  its weights, and "also italic" if needed. On save, Trefle downloads the
  files once and serves them itself. Visitors never contact Google.
- An unknown name or weight prevents saving, with a message naming it.
- Each font shows **"used by N pages"**: check it before removing one.
- In the editor, the fonts of the page's domain come first in the font list.
- **A Penpot import adds** to the domain the fonts, weights and italics the
  imported boards use. It never removes or changes any.

## Error messages

The messages are shown in French; here is what each one means.

| Message (meaning) | What to do |
|---|---|
| The file is over 100 MB | Export it with lighter images. |
| The file is not a Penpot export | Export from Penpot: file menu › Export › .penpot file. |
| The file comes from an old Penpot version | Open it in Penpot 2, then export it again. |
| The file contains several Penpot files (libraries included) | Export only the site's file, without libraries. |
| The file is too large once unpacked | Remove unneeded pages or images from the file. |
| At most 10 pages per import | Untick boards, then import the others in a second import. |
| The analysis has expired, drop the file again | The analysis is more than an hour old: start again. |
| The page « … » is too detailed for the editor | Simplify that board in Penpot, or untick it. |
| Google fonts could not be retrieved | Try again in a few minutes. |
| The import took too long (6 minutes) | Try again with fewer boards. |

## For administrators

- The import is enabled with **`PENPOT_IMPORT=on`** in the server's
  `infra/.env`, then a restart of the `cms` service. Empty (the default),
  the button is hidden and the `/api/site-imports/*` routes answer "not
  found".
- Fonts are downloaded from Google Fonts when a domain is saved or an
  import adds some. Published pages never contact Google.
