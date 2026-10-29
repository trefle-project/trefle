# Panels and editor UI

The default GrapesJS chrome is a demo, not a product. Shipping it unchanged is
the clearest sign of an unfinished integration. There are two ways to change it,
and picking the wrong one costs weeks.

## Two strategies

**Extend the built-in panels** when you want the standard editor with your
buttons added. Cheap, works with everything, limited by the built-in layout.

**Render your own chrome** when the editor is part of a designed product. Turn
off the default panels, build your toolbar/sidebar in React or Vue *outside* the
editor container, and talk to the editor through commands and events. This is
what a polished builder does — the editor becomes the canvas only.

The trap is doing half of each: fighting the built-in panel CSS to make it look
like your product. That never converges. Decide early.

## Extending the built-in panels

```js
editor.Panels.addButton('options', {
  id: 'my-publish',
  className: 'fa fa-rocket',
  command: 'export-and-publish',      // a registered command — see events-commands.md
  attributes: { title: 'Publish' },
});

editor.Panels.addPanel({
  id: 'my-panel',
  appendTo: '.my-sidebar',            // query selector for where it mounts
  visible: true,
  buttons: [{ id: 'a', command: 'my:cmd', label: 'A' }],
});
```

Surface: `addPanel`, `removePanel`, `getPanel`, `getPanels`, `addButton`,
`removeButton`, `getButton`, `getPanelsEl`, `render`.

Buttons are **stateful when their command is**. A button whose command defines
both `run` and `stop` behaves as a toggle and tracks active state automatically;
one whose command only defines `run` fires and resets. This is why toolbar
toggles should be commands rather than inline handlers.

Default panel ids you will encounter: `options`, `views`, `views-container`,
`devices-c`. Discover the live set rather than trusting a list:

```js
console.log(editor.Panels.getPanels().map((p) => p.id));
```

## Rendering your own chrome

Disable what you don't want at init, then drive the editor from outside:

```js
grapesjs.init({
  container: '#gjs',
  panels: { defaults: [] },        // no built-in panels at all
  blockManager: { appendTo: '#my-blocks' },
  styleManager: { appendTo: '#my-styles' },
  layerManager: { appendTo: '#my-layers' },
  traitManager: { appendTo: '#my-traits' },
});
```

Each manager can mount into an element you own, so you keep GrapesJS's widget
behaviour while controlling the layout completely. Your React/Vue components then
sit around those mount points and never re-render them.

The rule from `framework-integration.md` applies with force here: **your chrome
lives outside the editor container.** Anything your framework renders inside the
editor's own DOM will fight GrapesJS for it.

Wire your buttons to commands and your indicators to events:

```jsx
<button onClick={() => editor.runCommand('core:preview')}>Preview</button>
<button onClick={() => editor.UndoManager.undo()} disabled={!canUndo}>Undo</button>
```

```js
editor.on('update', () => setCanUndo(editor.UndoManager.hasUndo()));
editor.on('component:selected', setSelected);
editor.on('storage:end:store', () => setSavedAt(Date.now()));
```

## Modals

`editor.Modal` is the built-in dialog, and it is what the core's own commands use
(`core:open-code` and friends), so reusing it keeps things consistent:

```js
editor.Modal.setTitle('Publish')
  .setContent(myElement)          // string or HTMLElement
  .open();

editor.Modal.onceClose(() => cleanup());
```

Surface: `open`, `close`, `isOpen`, `setTitle`, `getTitle`, `setContent`,
`getContent`, `getContentEl`, `onceOpen`, `onceClose`.

If your product already has a dialog system, use that instead and leave the
editor's modal alone — mixing two modal stacks produces focus-trap fights and
double backdrops. Just don't run the core commands that open the built-in one.

## Layer and selector managers

`editor.Layers` is the component tree UI. Beyond `appendTo`, the useful part is
programmatic: `Layers.setLayerData(component, { open: true })` to expand a
subtree, and the `layer:component` event when the user picks a node there.

`editor.Selectors` is the class/state control. Two things matter for a product
build: it decides whether styling targets the class or the single element (the
`#3` cause in `styling-canvas.md`), and `selectorManager: { componentFirst: true }`
flips the default so edits hit the selected component rather than everything
sharing its class. For non-technical end users, `componentFirst: true` is almost
always the right default — the class-wide behaviour surprises them.

## Style manager sectors

The default sector list is every CSS property GrapesJS knows. For a product,
define your own:

```js
styleManager: {
  sectors: [
    { name: 'Layout',  properties: ['display', 'width', 'padding', 'margin'] },
    { name: 'Type',    properties: ['font-size', 'line-height', 'color', 'text-align'] },
    { name: 'Surface', properties: ['background-color', 'border-radius', 'box-shadow'] },
  ],
}
```

Fewer properties, named after design decisions rather than CSS. Restricting what
users can style is the single biggest lever on whether their output stays
on-brand — see `styling-canvas.md`.

## Checklist

1. One strategy chosen — extend the defaults, or replace them. Not both.
2. Every button is backed by a registered command.
3. Toggle buttons use commands with both `run` and `stop`.
4. Custom chrome renders outside the editor container.
5. Managers mounted with `appendTo` rather than re-implemented.
6. `componentFirst` set deliberately for the audience.
7. Style sectors curated, not left at defaults.
