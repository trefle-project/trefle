# Traits

Traits are the settings panel for the selected component. By default a trait
writes to an HTML **attribute**; that default is the source of most confusion.

## Declaring traits

```js
traits: [
  'title',                                        // shorthand → text input on attribute
  { type: 'text',     name: 'alt',  label: 'Alt text' },
  { type: 'checkbox', name: 'target', valueTrue: '_blank', valueFalse: '' },
  { type: 'select',   name: 'size',  options: [
      { id: 'sm', label: 'Small' }, { id: 'lg', label: 'Large' } ] },
]
```

Built-in types: `text`, `number`, `checkbox`, `select`, `color`, `button`.
`checkbox` uses `valueTrue` / `valueFalse` to control what lands on the attribute
— without them you get `true` / `false` strings in the export, which is rarely
what you want for things like `target="_blank"`.

## Attribute vs model property

- Default: the trait value goes to the element's attributes and appears in the
  export.
- `changeProp: true`: the value goes to the model property of the same name
  instead. Use this when the value drives behaviour rather than markup — it is
  also what you combine with declared script props so the canvas script re-runs
  when the user edits the field.

Mixing these up produces the classic "I changed the setting and nothing
happened": the value landed on an attribute nobody reads.

## Custom trait types

Register a type when the built-ins can't express the input — an asset picker, a
linked-record selector, a rich sub-form.

```js
editor.Traits.addType('my-picker', {
  createInput({ trait, component, elInput }) {
    const el = document.createElement('div');
    // build the UI, attach your own listeners
    return el;                       // string or HTMLElement
  },
  onEvent({ component, elInput, trait, event }) {
    // read the UI, write to the component
    component.set('myProp', elInput.dataset.value);
  },
  onUpdate({ component, elInput, trait }) {
    // component changed elsewhere → reflect it in the UI
    elInput.dataset.value = component.get('myProp');
  },
});
```

Implement `onUpdate` even when it feels optional. Without it the panel goes stale
whenever the value changes from undo, from another panel, or programmatically.

Custom trait UI renders in the **host document**, not the canvas iframe — style
it with your app's CSS, and do not reach into canvas DOM from here.

## Dynamic traits

To vary the panel by component state, update the component's traits collection
in response to model changes. Keep it cheap: this runs on selection.

```js
editor.on('component:selected', (component) => {
  if (component.get('type') !== 'my-card') return;
  component.set('traits', component.get('layout') === 'grid'
    ? ['title', 'columns']
    : ['title']);
});
```

Trait activity is observable too: `trait:value` fires when a value changes,
`trait:select` when the panel targets a new component. See `events-commands.md`.

## Checklist

1. Every trait that drives behaviour uses `changeProp: true`.
2. Every trait that must appear in the export writes an attribute.
3. Custom trait types implement `onUpdate`.
4. Labels are human-readable — the panel is end-user UI, not a debug view.
5. Undo/redo reflects trait edits correctly.
