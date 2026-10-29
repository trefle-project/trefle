# Custom code and direct HTML editing

User guide for Trefle admins and editors (feature 014). It explains how to
edit a page's HTML, add scripts (pixels, analytics, widgets) and place a
widget at a precise spot in the page. French version:
[code-personnalise.fr.md](code-personnalise.fr.md).

The admin interface is in French; button and section names are given as they
appear on screen, with a translation.

## Who can do what

| Action | Admin | Editor |
|---|---|---|
| Edit a page's HTML and CSS (« Code » view) | ✅ | ✅ |
| Add or change the page's scripts (« Scripts » section) | ✅ | ❌ (section hidden) |
| Add a « Code personnalisé » (custom code) block or change its code | ✅ | ❌ |
| Move or delete an existing custom code block | ✅ | ✅ |

Code added by an admin runs only on the public page, for its visitors. It
never runs in the editor or the admin.

## Editing HTML and CSS: the « Code » view

In the page editor, click **« </> »** (« Modifier le code HTML et CSS »).

- Two code editors open: **HTML** and **CSS**, with syntax highlighting.
- After a paste, **« Mettre en forme »** (format) re-indents the code.
- **« Vérifier et appliquer »** (check and apply) first lists everything that
  will not be published. You can go back to the code, or apply anyway.
- **Ctrl+Z** (**Cmd+Z** on a Mac) undoes the whole apply in one step.
- Nothing is saved until you save the page.

**Accepted in the HTML:** headings, paragraphs, lists, links, images,
tables, buttons, video and audio, iframes (YouTube, Vimeo, maps…), SVG,
`details`/`summary`, structural tags (`header`, `footer`, `article`…).

**Removed at publication:**
- `<script>`: use the « Scripts » section or the custom code block (admins);
- `onclick`, `onload`… attributes;
- `javascript:` links;
- `<style>`: put CSS in the CSS editor;
- forms and input fields: use the « Formulaire (lead) » block, the only form
  allowed, so that every lead is recorded and protected.

The positions of the form and of code blocks appear in the HTML as
`<div data-block="…">` lines. Leave them in place: deleting one deletes the
block.

## Adding scripts to a page (admins)

At the bottom of the page, open the **« Scripts »** section. It has two
areas.

- **« Dans l'en-tête de la page »** (in the page head): `<meta>`/`<link>`
  tags (for example a domain verification) go in the head. Scripts run
  before the page content.
- **« En fin de page »** (end of page): runs after the content. The
  recommended place for most pixels and chat widgets.

Paste the code exactly as the vendor provides it. Limit: 50,000 characters
per area.

These scripts also apply to the page's A/B variants, to the preview and to
the **confirmation page**, where the conversion (lead) event usually goes.

## Cookie consent

Every script and every code block has a **« Consentement »** (consent)
setting.

- **« Nécessite le consentement cookies »** (requires cookie consent, the
  default). The code runs only after the visitor clicks **« Accepter »**
  (accept) in the cookie banner. It starts immediately, without reloading
  the page, or on load if the visitor accepted on a previous visit. After a
  refusal it never runs. Use it for advertising pixels and analytics tools.
- **« Essentiel »** (essential). The code always runs. Keep it for widgets
  that set no tracking cookie.

If the page's domain has **no cookie banner**, visitors cannot accept, so
code that requires consent will never run. A warning says so in the
« Scripts » section. Turn on the domain's banner, or switch the code to
« Essentiel » if it does not track visitors.

## Placing a widget in the page: the custom code block (admins)

For a booking calendar, a map or a video player at a precise spot:

1. In the block library, **drag** « Code personnalisé » into the page. You
   can also **click** it: it is added right after the selected block.
2. The « Code personnalisé » window opens. Paste the widget code (HTML and
   script), choose the consent setting, then click **« Enregistrer »**
   (save).
3. Save the page.

In the editor the block shows as a purple « </> Code personnalisé » frame.
The real widget only appears on the published page. Double-click the block
to change its code.

A block placed in a section or a column follows its layout, on mobile too.
A block that requires consent stays empty until the visitor accepts.

## Limits

- **Vendor code.** Some older widgets use `onclick` attributes in their own
  code, or `document.write`, which the pages' security policy blocks. Common
  tools work: Meta, TikTok and LinkedIn pixels, Google Analytics (gtag),
  Hotjar, Calendly, HubSpot and Crisp chats, YouTube and Vimeo videos.
- **Unchecked content.** Trefle does not check the content of pasted code:
  the admin is responsible for it.
- **Duplicating a page.** An editor cannot duplicate a page that contains
  custom code blocks, because the copy would point to code they cannot read.
  An admin can. Creating A/B variants works for everyone.
- **History.** Every change to scripts or code blocks is written to the
  activity log, with its author.
