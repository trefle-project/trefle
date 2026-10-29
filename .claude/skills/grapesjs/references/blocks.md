# Blocks

A block is a palette entry that produces content when dragged onto the canvas.
Blocks are not components: a block is the *source*, the component is what the
canvas gets.

`Blocks.add(id, props, opts?)` takes a `BlockProperties`: `label` (required),
`media`, `category`, `content`, `attributes`, `select`, `activate`, `disable`,
`order`. A component type can also declare its own block inline via the `block`
key on `addType` — see `components.md`.

## Registration

```js
editor.Blocks.add('hero-block', {
  label: 'Hero',
  category: 'Sections',
  media: '<svg viewBox="0 0 24 24">…</svg>',
  content: { type: 'hero' },
});
```

## Content: object, not string

This is the main mistake. `content: '<div class="hero">…</div>'` gets parsed as
plain HTML and only becomes your custom type if `isComponent` happens to match
it. Passing a component definition object is explicit and always correct:

```js
content: {
  type: 'hero',
  components: [
    { type: 'text', content: 'Headline' },
    { type: 'link', content: 'Call to action', attributes: { href: '#' } },
  ],
}
```

Use an HTML string only for genuinely static markup with no custom type behind it.

## Categories

Categories group the palette and are created implicitly by name. Keep names
stable — renaming a category scatters existing blocks across two groups. For
control over ordering and default open/closed state, pass the category as an
object with an id and options rather than a bare string.

## Media

Inline SVG is the right choice: it inherits the editor theme's color and needs
no asset pipeline. A raster `<img>` works but will look wrong in dark themes and
adds a network request per block.

## Drop targeting

Where a block may land is decided by the **component's** `droppable`/`draggable`
rules, not by the block. If users can drop a section inside a button, fix the
component model, not the block definition.

To act on the result of a drop — select the new component, open its settings,
scroll it into view — listen for `component:add`, or `block:drag:stop` if you
need the block that produced it:

```js
editor.on('component:add', (component) => {
  if (component.get('type') !== 'hero') return;
  editor.select(component);
});
```

`block:drag:start` / `block:drag` / `block:drag:stop` track the drag itself; the
canvas side fires `canvas:dragenter`, `canvas:dragover` and `canvas:drop`. Full
list in `events-commands.md`.

Setting `select: true` on the block handles the common "select what I just
dropped" case without any event handler at all.

## Reordering and removing built-ins

Preset plugins register their own blocks. To curate the palette, remove the ones
you don't want after the plugin has run, and re-add your own. Do this once on
editor load, not on every render.

## Checklist

1. `content` is a component definition object when a custom type is involved.
2. Category names are stable and few.
3. `media` is inline SVG.
4. Drop restrictions live on the component model.
5. Dropping the block produces exactly the tree you expect — verify in the layer
   manager, not just visually.
