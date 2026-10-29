# Pages and i18n

Two unrelated modules, grouped because both are things integrators discover too
late — the first when publishing, the second when the product ships outside
English.

## Pages

A project holds many pages; the editor edits one at a time. `getHtml()` and
`getCss()` always operate on the **selected** page.

```js
editor.Pages.add({ name: 'Pricing' }, { select: true });
editor.Pages.select('page-id');

editor.Pages.getAll();        // Page[]
editor.Pages.getSelected();   // Page | undefined
editor.Pages.getMain();       // the first/main page
editor.Pages.remove('page-id');
```

`PageProperties`: `id`, `name`, `component` (HTML string or component
definitions), `styles`, `frames`, `skipFromStorage`.

### Publishing every page

The single most common multi-page bug is shipping one page and calling it a site:

```js
async function publishAll(editor) {
  const current = editor.Pages.getSelected();
  const output = [];

  for (const page of editor.Pages.getAll()) {
    editor.Pages.select(page);
    output.push({
      id: page.getId(),
      name: page.getName(),
      html: editor.getHtml({ cleanId: true }),
      css: editor.getCss({ keepUnusedStyles: true }),
    });
  }

  editor.Pages.select(current);   // restore what the user was editing
  return output;
}
```

Two details that matter: **restore the selection** when you're done, or the user
finds themselves on a different page after clicking Publish; and note that CSS is
project-wide, not per page — every page's export will contain rules used by other
pages unless you post-process. For most sites, shipping one shared stylesheet is
simpler and smaller than trying to split it.

`skipFromStorage: true` keeps a page out of project data — useful for scratch or
preview pages you generate at runtime.

Events: `page:add`, `page:select`, `page:select:before`, `page:remove`,
`page:update`. Drive a page switcher from `page:select`.

## i18n

`editor.I18n` translates the **editor UI**, not user content. User content
localization is a data-modelling problem you solve with pages or data sources.

```js
grapesjs.init({
  i18n: {
    locale: 'de',
    localeFallback: 'en',
    detectLocale: true,        // default; reads the browser language
    messagesAdd: {
      de: {
        blockManager: {
          labels: { 'hero-block': 'Held' },
          categories: { Sections: 'Abschnitte' },
        },
        traitManager: {
          traits: {
            labels: { href: 'Ziel-URL' },
            options: { target: { false: 'Dieses Fenster', _blank: 'Neues Fenster' } },
          },
        },
      },
    },
  },
});
```

At runtime: `I18n.setLocale('fr')`, `getLocale()`, `addMessages(msg)`,
`t(key, opts)`.

### The message tree

Mirror the shape of the shipped `en` locale — a typo in a key is silent, you just
keep seeing English:

```
assetManager   { addButton, inputPlh, modalTitle, uploadTitle }
blockManager   { labels: { <block-id>: … }, categories: { <category-id>: … } }
domComponents  { names: { text, image, link, table, … } }
deviceManager  { device, devices: { desktop, tablet, mobileLandscape, mobilePortrait } }
panels         { buttons: { titles: { preview, fullscreen, 'open-sm', 'open-tm', … } } }
selectorManager{ label, selected, emptyState, states: { hover, active, … } }
styleManager   { empty, layer, fileButton, sectors: {…}, properties: {…} }
traitManager   { empty, label, categories: {…},
                 traits: { labels: { <trait-name>: … },
                           attributes: { <trait-name>: { placeholder } },
                           options: { <trait-name>: { <value>: … } } } }
storageManager { recover, … }
```

Note `traitManager.traits.options` — that is how you translate the *values* of a
select trait, not just its label. Easy to miss, and it leaves half-translated
dropdowns when you do.

Use `messagesAdd` rather than `messages` unless you intend to replace the entire
built-in message set — `messages` overwrites, `messagesAdd` merges. Replacing it
wholesale is how people accidentally blank out every default label in the editor.

### Localizing what you register

Block labels, category names and trait labels all resolve through i18n *by id*.
This is why `plugin-authoring.md` insists that every user-facing string be an
option: a block registered with a hardcoded English `label` cannot be translated
by the consumer, whereas one whose label resolves through `blockManager.labels`
can.

```js
editor.Blocks.add('my-hero', { label: 'Hero', category: 'Sections' });
// consumers translate by id: { blockManager: { labels: { 'my-hero': '…' } } }
```

Call `I18n.t()` for your own strings so they participate in the same fallback
chain instead of inventing a second translation mechanism next to it.

### Right-to-left

Locale alone does not flip the editor. RTL means the canvas content direction
(set `dir` on the canvas body or through canvas styles) and the editor chrome
(your own CSS) — two separate jobs. The canvas being an iframe means your host
page's `dir` attribute does not reach it.

## Checklist

1. Publish iterates `Pages.getAll()`, not just the selected page.
2. Page selection restored after a programmatic sweep.
3. `messagesAdd` used instead of `messages`.
4. Block/category/trait strings translatable by id, not hardcoded.
5. Locale set before first render, or `setLocale` triggers a re-render.
6. RTL handled in both the canvas and the chrome, if needed.
