# Events, commands, keymaps, undo

Every integration eventually needs to react to what the user does, or to drive
the editor from outside it. Events are how you observe; commands are how you act.

Event names are stable strings, exported as typed enums. Dump the full set for
the installed version with `${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh --events` —
0.23.x has 20 enums and just over 200 constants. The ones you actually reach for
are below.

## Subscribing

```js
editor.on('component:selected', (component) => { /* … */ });
editor.once('load', () => { /* editor is ready */ });
editor.off('component:selected', handler);
```

Two things that bite:

- **Always remove listeners you add outside the editor's lifecycle.** In React,
  subscribe and unsubscribe in the same effect that owns the editor instance.
- **Namespace wildcards exist.** Most enums include an `all` member — `'component'`,
  `'block'`, `'asset'`, `'page'`, `'style'`, `'trait'`, `'data'` — which fires for
  every event in that group. Useful for debugging, expensive in production.

Some names are **prefixes**, not complete events: `component:update:` takes a
property name (`component:update:title`), and `command:run:` takes a command id
(`command:run:core:preview`). The trailing colon in the typings is the tell.

## The events worth knowing

**Lifecycle**

| Event | Fires when |
| --- | --- |
| `load` | The editor is fully initialized. Do first-run setup here, not right after `init()`. |
| `update` | Anything in the project changed. The coarsest "dirty" signal. |
| `project:load` | Project JSON loaded — on init and on every `loadProjectData`. |
| `destroy` / `destroyed` | Teardown. |
| `undo` / `redo` | The user moved through history. |

**Components**

| Event | Fires when |
| --- | --- |
| `component:add` / `component:remove` / `component:removed` | The tree changed. |
| `component:select` / `component:selected` / `component:deselected` | Selection changed — drive your own inspector from these. |
| `component:update` | Any component property changed. |
| `component:update:<prop>` | One named property changed. Much cheaper than filtering `component:update`. |
| `component:styleUpdate` / `component:styleUpdate:<prop>` | The user restyled something. |
| `component:drag:start` / `component:drag` / `component:drag:end` | Live drag state. |
| `component:create` | A component instance was constructed. |

**Blocks and canvas**

`block:drag:start`, `block:drag`, `block:drag:stop`, plus `canvas:dragenter`,
`canvas:dragover`, `canvas:drop` on the receiving side. `canvas:frame:load`
(and `:head` / `:body`) is how you get at the iframe document safely.

**Storage** — `storage:start:store`, `storage:end:store`, `storage:error`, and
the `:load` variants. Build the save indicator on these; see `storage-export.md`.

**Everything else** — `trait:value`, `asset:upload:start` / `:end` / `:error`,
`page:select`, `page:add`, `style:target`, `selector:state`, `rte:enable` /
`rte:disable`, `data:update`.

## Reacting to a drop

The canonical "do something when the user adds my component" pattern:

```js
editor.on('component:add', (component) => {
  if (component.get('type') !== 'pricing-card') return;
  editor.select(component);
  editor.Commands.run('open-my-settings', { component });
});
```

Note `component:add` fires for programmatic additions too — including the initial
project load, which can fire it hundreds of times. If the handler should only run
for genuine user drops, gate it on `editor.getDirtyCount()` or set a flag inside
the `load` handler.

## Commands

A command is a named, reusable action. Anything a panel button, a keyboard
shortcut or your own React chrome triggers should be a command, so all three call
one implementation.

```js
editor.Commands.add('export-and-publish', {
  run(editor, sender, options = {}) {
    const html = editor.getHtml({ cleanId: true });
    const css = editor.getCss({ keepUnusedStyles: true });
    return publish({ html, css, ...options });
  },
  stop(editor, sender) {
    // only needed for stateful commands (see below)
  },
});

editor.Commands.run('export-and-publish', { draft: true });
editor.runCommand('export-and-publish', { draft: true });   // same thing
```

`editor.runCommand` / `editor.stopCommand` are shortcuts for
`editor.Commands.run` / `.stop`; use whichever reads better.

**Stateful vs. one-shot.** A command with both `run` and `stop` is a toggle: it
stays "active" until stopped, and `Commands.isActive(id)` reports on it. A
command with only `run` is one-shot. Built-in toggles include `core:preview`,
`core:fullscreen`, `core:open-code` and the border/component-outline toggles —
run them again or call `stop` to exit.

Full surface: `add`, `remove`, `get`, `has`, `getAll`, `run`, `stop`, `isActive`,
`getActive`. Command activity is observable through `command:run`,
`command:run:<id>`, `command:stop` and `command:stop:<id>`.

Prefix your own command ids (`myplugin:do-thing`) — the core uses `core:` and
`tlb-` and collisions are silent.

## Keymaps

```js
editor.Keymaps.add('my-save', '⌘+s, ctrl+s', (editor) => {
  editor.store();
});
```

`add(id, keys, handler, opts?)`, plus `get`, `getAll`, `remove`, `removeAll`.
Keymaps fire while focus is in the canvas iframe as well as the host document,
which is exactly why you want them instead of your own `keydown` listener — a
host-page listener never sees keys pressed inside the canvas.

To drop a built-in shortcut, look up its id first — the defaults are registered
at runtime, not enumerated in the typings:

```js
console.log(Object.keys(editor.Keymaps.getAll()));
editor.Keymaps.remove('<the id you found>');
```

Removing is cleaner than trying to shadow a default with your own binding.

## Undo

`editor.UndoManager` — `undo()`, `redo()`, `undoAll()`, `redoAll()`,
`hasUndo()`, `hasRedo()`, `getStack()`, `getStackGroup()`, `add()`, `remove()`,
`removeAll()`, and `start()` / `stop()`.

`getStackGroup()` collapses operations that happened together into one entry,
which is what you want for a "history" UI; `getStack()` returns them individually.

`stop()` / `start()` is the important pair. Wrap programmatic setup in it so your
own seeding does not become an undo step the user can rewind into a broken state:

```js
editor.UndoManager.stop();
seedTheme(editor);          // not undoable
editor.UndoManager.start();
```

Drive your own undo/redo buttons off `hasUndo()` / `hasRedo()`, refreshed on the
`update` event — the built-in buttons are in a panel you may have removed.

## Checklist

1. Listeners registered and removed in the same lifecycle scope.
2. `component:update:<prop>` used instead of filtering inside `component:update`.
3. Handlers on `component:add` are safe to run during a bulk project load.
4. Every user-triggerable action is a command, not an inline handler.
5. Command ids and keymap ids are prefixed.
6. Programmatic seeding wrapped in `UndoManager.stop()` / `start()`.
7. Save state surfaced from `storage:*` events, not assumed.
