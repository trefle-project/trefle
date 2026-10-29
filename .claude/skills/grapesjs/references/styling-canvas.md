# Styling and the canvas

## The canvas is an iframe

The edited page lives in its own document. Nothing from your host page's CSS or
JS reaches it. Everything the content needs — fonts, resets, utility CSS,
runtime libraries — must be injected through the editor's canvas configuration
at init.

```js
grapesjs.init({
  container: '#gjs',
  canvas: {
    styles: ['https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap'],
    scripts: ['https://cdn.example.com/runtime.js'],
  },
});
```

Both accept `(string | Record<string, any>)[]`, so an entry can be an object when
you need attributes on the injected tag:

```js
canvas: {
  scripts: [{ src: 'https://cdn.example.com/runtime.js', defer: true }],
  styles:  [{ href: '/canvas.css', crossorigin: 'anonymous' }],
}
```

To run code inside the frame after it exists, listen for `canvas:frame:load`
(also `:head` / `:body`) rather than guessing at timing:

```js
editor.on('canvas:frame:load', ({ window: frameWin }) => {
  // frameWin.document is the canvas document
});
```

Consequences that surprise people:

- A font that renders in your app renders as fallback in the canvas until you
  inject it there too.
- `document.querySelector` from your app code cannot see canvas content. Use
  `editor.Canvas.getDocument()`, `getWindow()`, `getBody()` or `getFrameEl()`.
- Media queries inside the canvas evaluate against the **frame** width, which is
  how device previews work. That is a feature, not a bug.

## Tailwind and utility CSS

Two separate problems.

1. **Rendering.** Inject the compiled stylesheet as a canvas style so classes
   apply while editing.
2. **Purging.** Your build has no idea which classes end-users will type into the
   editor, so a purged production build will strip them. Ship an unpurged
   stylesheet for the canvas, or safelist the classes you expose.

The CDN/JIT-in-browser build is the pragmatic choice for the canvas even when
your app uses a compiled build.

## "My style did not apply"

Work down this list in order — the answer is almost always in the top three.

1. **Wrong device.** Editing while a narrower device is selected writes the rule
   into that device's media query. It applies at that width only.
2. **Wrong state.** With a state like hover active, edits go to the state rule,
   not the base rule.
3. **Wrong target.** The style manager writes to whatever selector is currently
   targeted. With a class selected, the rule hits every element with that class;
   with the id target chosen, only this one. Users flip this without noticing.
4. **Specificity.** A rule from an injected stylesheet can outrank a generated
   class rule. Check computed styles in the canvas frame's devtools.
5. **Inline vs rules.** The editor can write styles as element inline styles or
   as CSS rules depending on configuration. It changes both cascade behaviour and
   what the export looks like — set it deliberately at init.
6. **Property not stylable.** The component model can restrict which properties
   are editable; the sector is present but the write is ignored.
7. **It applies in the canvas but not in the export.** `getCss()` prunes rules
   that no component currently matches. Hand-written or programmatically seeded
   CSS is the usual casualty. Pass `keepUnusedStyles: true`.

## Devices

Devices define the preview widths and the breakpoints in the export. Define them
once, matching your design system, before content exists. Adding or renaming
devices later does not migrate rules already written under the old breakpoints.

## Writing rules programmatically

Setting rules from code is the right way to seed a theme or apply a design token.

```js
editor.Css.setRule('.btn', { padding: '12px 20px', 'border-radius': '6px' });

// Device- and state-scoped: pass the media query explicitly. Without it the
// rule lands on the base selector no matter which device is currently shown.
editor.Css.setRule('.btn', { padding: '8px 14px' }, {
  atRuleType: 'media',
  atRuleParams: '(max-width: 480px)',
});

// State goes in the selector string, not in the options.
editor.Css.setRule('.btn:hover', { opacity: '0.8' });

// Merge into an existing rule instead of replacing its styles.
editor.Css.setRule('.btn', { color: 'blue' }, { addStyles: true });

editor.Css.addRules('.card { display: grid } @media (max-width: 480px) { .card { display: block } }');
```

`setRule` **replaces** the style object of an existing rule by default; pass
`addStyles: true` to merge. `addRules` parses a CSS string and is the fastest way
to seed a whole theme.
Note the interaction with export: rules no component matches are pruned from
`getCss()` unless you pass `keepUnusedStyles: true` — see `storage-export.md`.

## Style manager configuration

The default sector list is generic. For a product-grade builder, cut it down:
fewer properties, named after design decisions rather than CSS ("Spacing" not
"padding-top"). Restricting what users can style is the single biggest lever on
whether their output stays on-brand.

## Checklist

1. Fonts and required CSS injected as canvas styles.
2. Utility CSS not purged out of the canvas stylesheet.
3. Devices defined before any content is authored.
4. Inline-vs-rules behaviour set deliberately.
5. Style sectors curated, not left at defaults.
6. Exported CSS inspected at least once — it should contain the media queries you
   expect and nothing editor-only.
