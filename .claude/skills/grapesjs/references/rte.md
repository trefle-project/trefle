# Rich text editing

The built-in RTE is a small floating toolbar over `contenteditable`, active while
a text component is being edited. It covers bold/italic/underline/link and not
much else — which is deliberate, because most of what people want from a rich
text editor conflicts with a component-based page builder.

Decide which of three you need before writing code:

1. **Restrict the default** — remove actions so users can't produce markup you
   can't style. Usually the right answer.
2. **Add actions** — a brand-specific inline style, a merge-tag inserter.
3. **Replace it entirely** — swap in TipTap, Quill or ProseMirror via `customRte`.

## Restricting and adding actions

```js
grapesjs.init({
  richTextEditor: {
    actions: ['bold', 'italic', 'link'],   // the whole toolbar, in order
    adjustToolbar: true,
  },
});

editor.RichTextEditor.add('highlight', {
  icon: '<b style="background:#ff0">H</b>',
  attributes: { title: 'Highlight' },
  result: (rte) => rte.insertHTML(`<mark>${rte.selection()}</mark>`),
  state: (rte, doc) => (doc.queryCommandState('hiliteColor') ? 1 : 0),
});

editor.RichTextEditor.remove('wrap');
```

Surface: `add`, `get`, `getAll`, `remove`, `run`, `getToolbarEl`,
`updatePosition`. An action is `{ name, icon, result, update?, state?, event?,
attributes? }`; `state` drives the pressed/unpressed look, and omitting it gives
you a button that never reflects the cursor's context.

`onPaste` and `onKeydown` hooks on the config are where you strip pasted styles —
worth doing, because pasting from Word or Google Docs is how unstyleable markup
gets into a project.

## Replacing the RTE

`customRte` is a lifecycle contract, not a plugin format:

```js
grapesjs.init({
  richTextEditor: { custom: true },
});

editor.setCustomRte({
  parseContent: true,       // parse the returned HTML back into components

  enable(el, rte, opts) {
    // el is the contenteditable element inside the canvas iframe
    return rte || new MyEditor(el, { content: el.innerHTML });
  },

  disable(el, rte, opts) {
    rte?.blur();
  },

  getContent(el, rte, opts) {
    return rte.getHTML();          // what gets stored and exported
  },

  destroy() {
    // called on editor destroy
  },
});
```

Four things that decide whether this works:

- **`enable` is called with the existing instance.** Return it rather than
  constructing a new one every time, or you leak an editor per focus.
- **`enable` and `getContent` may be async.** Returning a promise is supported;
  useful when the third-party editor initializes lazily.
- **`parseContent` is the fork in the road.** `true` parses the returned HTML
  back into GrapesJS components — the RTE's output becomes part of the component
  tree, stylable and selectable. `false` keeps the HTML opaque, used as-is in
  canvas and export. Choose `false` for editors whose markup you don't want
  GrapesJS rewriting, and accept that those regions are then black boxes.
- **The element lives in the canvas iframe.** Your RTE's own toolbar, if it
  renders one, must be mounted somewhere it can escape the frame — most
  third-party editors assume a single document and need help here. This is the
  part that usually costs a day.

Events: `rte:enable`, `rte:disable`, `rte:custom`.

## Interaction with components

- Only components with `editable: true` (or a type built on `text`) enter RTE
  mode. If double-clicking does nothing, that flag is why.
- A component with `editable: true` and child components is a hazard: the user
  can delete the children by editing text over them. Either allow text or allow
  children, rarely both.
- Text produced by the RTE becomes part of the component's content and is
  exported through `getHtml()` like anything else.

## Checklist

1. Toolbar actions restricted to what your design system can render.
2. `onPaste` strips foreign styles.
3. Custom actions implement `state` so they reflect the cursor.
4. `customRte.enable` reuses the passed instance.
5. `parseContent` set deliberately.
6. A third-party RTE's toolbar renders outside the canvas iframe.
7. Components are either editable or containers — not both.
