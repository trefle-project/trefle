# Data sources

**Requires grapesjs 0.22+.** The module does not exist in 0.21.x — check
`${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh --version` before proposing it, and fall
back to component `script` + props on older versions.

`editor.DataSources` binds editor content to data instead of literal text. It is
the newest major module in the core and the least documented elsewhere — if a
user is hand-rolling "dynamic content" with `script` and `fetch`, this is usually
what they actually wanted.

Use it when content should come from a record: product cards from a catalog,
personalization tokens in an email, a repeated list whose length isn't known at
design time.

## The model

| Concept | Component type | What it does |
| --- | --- | --- |
| Variable | `data-variable` | Renders one value from a path |
| Collection | `data-collection` | Repeats its children over a list |
| Collection item | `data-collection-item` | The per-item scope inside a collection |
| Condition | `data-condition` | Shows one branch or the other |
| Condition branches | `data-condition-true-content` / `data-condition-false-content` | The two branches |

Values are addressed by **path**: `<dataSourceId>.<recordId>.<property>`.

## Registering a source

```js
editor.DataSources.add({
  id: 'catalog',
  records: [
    { id: 'p1', name: 'Standard', price: '29' },
    { id: 'p2', name: 'Pro', price: '99' },
  ],
});

editor.DataSources.getValue('catalog.p1.price');        // '29'
editor.DataSources.setValue('catalog.p1.price', '39');  // updates everything bound to it
```

Surface: `add`, `get`, `getAll`, `remove`, `getValue`, `setValue`, `getContext`,
`store`, `load`. A source can also be given a `schema` or a `provider` for
data fetched asynchronously rather than supplied inline.

Sources can be seeded at init through the `dataSources` config, which is the
right place when the data is known before the editor mounts.

## Binding content

```js
editor.addComponents({
  type: 'data-variable',
  path: 'catalog.p1.name',
  defaultValue: 'Product',
});
```

`defaultValue` is what renders when the path resolves to nothing — in the editor
before data loads, and in the export if the value is missing. Always set it, or
authors design against empty boxes.

A collection repeats its subtree over a list. It needs a `collectionId` (the name
its items are addressed by) and a `dataSource` pointing at the list:

```js
editor.addComponents({
  type: 'data-collection',
  collectionId: 'products',
  dataSource: { type: 'data-variable', path: 'catalog' },
  startIndex: 0,
  endIndex: 9,                       // optional windowing
  components: [{
    type: 'data-collection-item',
    components: [
      { type: 'data-variable', collectionId: 'products', path: 'name' },
      { type: 'data-variable', collectionId: 'products', path: 'price' },
    ],
  }],
});
```

Variables inside an item carry the `collectionId` so their short path resolves
against the current record rather than the global data tree. `asPlainText: true`
on a variable escapes the value instead of letting it render as HTML — set it for
anything user-supplied.

## Reactivity

`setValue` propagates to every bound component. That is the point of the module,
and also the performance cliff: a `setValue` in a loop re-renders on each call.
Batch by mutating the record and letting one update fire.

Events: `data:add`, `data:update`, `data:remove`, `data:path`, plus
`data:provider:load` / `:loadAll` / `:load:error` for async providers. Wire the
provider error event to visible UI — a source that silently fails to load looks
identical to one with no records.

## What it does and does not solve

**Does:** design-time binding, repeated structures, conditional regions, keeping
one template in sync with many records.

**Does not:** render at request time on your server. The export contains the
resolved output at export time, or the binding markup, depending on how you
publish. If you need per-visitor personalization, treat the export as a template
your runtime hydrates — decide which of the two you are doing before building on
it, because retrofitting is expensive.

Storage: data sources are stored with the project through `store()` / `load()`,
so records containing anything sensitive end up in project JSON. Keep secrets out
and reference them by id.

`skipFromStorage` on a source is the lever for data that should stay out of the
saved project — a catalog you re-fetch on every load, rather than a snapshot
frozen into the JSON. Verify its polarity against the installed version before
relying on it: the field name and its JSDoc in 0.23.4 contradict each other, so
confirm empirically by saving and inspecting the stored project data.

`transformers` on a source lets you validate or reshape records as they enter —
the right place for coercion, rather than doing it at every binding site.

## Checklist

1. Every `data-variable` has a `defaultValue`.
2. User-supplied values use `asPlainText`.
3. Provider load errors surface in the UI.
4. `setValue` calls are batched, not looped.
5. Publish path decided: resolved-at-export vs. hydrated-at-runtime.
6. No credentials or PII inside records that get stored with the project.
