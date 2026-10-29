# Custom component types

Contents: registration shape · recognition · model defaults · drop rules ·
the `script` trap · custom views · extending existing types · checklist.

## Registration shape

`Components.addType(type, options)` takes an `AddComponentTypeOptions`:

| Key | Purpose |
| --- | --- |
| `isComponent` | Recognize a parsed DOM element as this type |
| `isParsedNode` | Same, but for the parser's node representation |
| `model` | Defaults and model behaviour |
| `view` | DOM lifecycle, editor-only rendering |
| `extend` / `extendView` | Inherit from another registered type |
| `extendFn` / `extendFnView` | Method names to *chain* rather than replace |
| `block` | Register a palette block for this type in one step |

```js
editor.Components.addType('my-card', {
  isComponent: (el) => el.tagName === 'DIV' && el.classList.contains('my-card'),
  model: {
    defaults: {
      tagName: 'div',
      classes: ['my-card'],
      droppable: false,
      traits: ['title', 'href'],
      components: [{ type: 'text', content: 'Card title' }],
    },
  },
  view: {
    onRender() { /* DOM lifecycle */ },
  },
});
```

Order matters: register every custom type **before** loading or setting content.
Content loaded first degrades to plain elements and does not upgrade later.

## Recognition

`isComponent(el)` runs against parsed DOM when HTML enters the editor. It decides
whether a node becomes your type. Two rules:

- Make it cheap and specific. It runs for every node on every parse.
- Make it match what your own component actually serializes to. If your model
  renders a wrapper class, recognize that class. A mismatch means a round trip
  through load/store silently downgrades your components.

Returning an object (a `ComponentDefinition`) instead of `true` lets you seed
properties from the parsed element, which is how you preserve authored
attributes on re-parse:

```js
isComponent: (el) => {
  if (el.tagName === 'DIV' && el.classList.contains('my-card')) {
    return { type: 'my-card', variant: el.dataset.variant || 'solid' };
  }
},
```

`isParsedNode` (**0.23+**) is the same decision made against the parser's node
objects rather than real DOM elements. Implement it when content arrives through
a custom parser path; `isComponent` alone covers the normal HTML-string case and
works on every version.

## Model defaults worth knowing

| Key | Purpose |
| --- | --- |
| `tagName`, `attributes`, `classes` | The rendered element |
| `components` | Default children, as component definitions not HTML strings |
| `traits` | What appears in the settings panel |
| `droppable`, `draggable` | Accept `true`/`false` or a CSS selector string |
| `editable` | Whether inner text is directly editable |
| `stylable` / `unstylable` | Which style properties the user may touch |
| `copyable`, `removable`, `selectable` | Editing affordances |
| `script`, `script-props` | Runtime behaviour inside the canvas |
| `toolbar` | Buttons on the selection badge |

Selector-based drop rules are the underused ones. `draggable: '.row'` means the
component can only be dropped into elements matching `.row`, which is how you
build layout systems that users cannot break.

## The `script` trap

This is the single most common GrapesJS bug.

`script` is serialized with `toString()` and executed inside the canvas frame.
It has no access to the module scope where you wrote it. Imports, outer
variables, and helper functions defined next to it are all undefined at runtime.

```js
// BROKEN — `formatPrice` and `API_URL` do not exist inside the canvas frame
model: {
  defaults: {
    script: function () {
      fetch(API_URL).then(r => r.json()).then(d => {
        this.textContent = formatPrice(d.price);
      });
    },
  },
}
```

Pass everything in through declared script props instead, and inline any helper:

```js
model: {
  defaults: {
    apiUrl: 'https://example.com/price',
    currency: 'EUR',
    'script-props': ['apiUrl', 'currency'],
    script: function (props) {
      const el = this;
      fetch(props.apiUrl)
        .then((r) => r.json())
        .then((d) => {
          el.textContent = new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: props.currency,
          }).format(d.price);
        });
    },
  },
}
```

Notes:

- `'script-props'` is the supported way to pass values in. The older
  string-interpolation approach is marked deprecated in the typings — do not
  reach for it.
- `this` inside `script` is the DOM element.
- Changing a declared prop re-runs the script. Undeclared model changes do not.
- The script runs in the export too, if the user publishes the generated HTML.
  Keep it dependency-free or ship the dependency via canvas scripts.
- Clean up after yourself: intervals and listeners created in `script` survive
  re-renders and leak while the user keeps editing.

## Custom views

Use a view only when you need DOM lifecycle that the model cannot express:
third-party widget initialization, canvas measurements, editor-only overlays.

```js
view: {
  init() { this.listenTo(this.model, 'change:someProp', this.handleChange); },
  onRender() { /* after the element is in the canvas DOM */ },
  removed() { /* tear down widgets, timers, observers */ },
}
```

Anything the view draws for editing convenience must not end up in the export.
If it would, render it from `script` instead, or strip it in `toHTML`.

## Extending an existing type

Prefer this over building from zero. Common bases: `text`, `link`, `image`,
`video`, `default`.

```js
editor.Components.addType('cta-link', {
  extend: 'link',                    // inherit the model
  extendView: 'link',                // inherit the view (optional, defaults to extend)
  extendFn: ['init'],                // chain these model methods instead of replacing
  model: {
    defaults: {
      traits: ['href', 'title', { type: 'select', name: 'variant',
        options: [{ id: 'solid', label: 'Solid' }, { id: 'ghost', label: 'Ghost' }] }],
    },
    init() { /* runs *after* link's own init, because of extendFn */ },
  },
});
```

`extendFn` is the subtle one. Without it, defining `init` in your `model`
**replaces** the base type's `init`, silently dropping whatever setup the base
did. Listing a method name in `extendFn` makes yours run in addition to it.
Reach for it whenever you override `init`, `updated` or any lifecycle method on
an extended type.

Typical use: a `link` that gains a "button style" trait, or an `image` that
restricts which assets can be chosen.

## Registering the block alongside the type

`block` lets a type ship its own palette entry, so the two can't drift apart:

```js
editor.Components.addType('my-card', {
  model: { defaults: { /* … */ } },
  block: { label: 'Card', category: 'Content', media: '<svg …>' },
});
```

`block: true` accepts the defaults. See `blocks.md` for when a standalone block
is the better choice.

## Serialization

If the export needs different markup than the canvas shows, override `toHTML` on
the model. Keep it deterministic — it runs on every export and on some storage
paths. Do not put side effects there.

## Checklist for a new component type

1. Registered before any content load.
2. `isComponent` matches the component's own serialized output.
3. Drop rules expressed on the model, not enforced by event handlers.
4. `script` closure-free; every external value is a declared prop.
5. Traits defined so users can configure it without touching code.
6. Round trip verified: export HTML → reload it → the type is still recognized.
