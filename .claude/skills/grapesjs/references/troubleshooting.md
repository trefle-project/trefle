# Troubleshooting: symptom → cause

Start here when the user reports a behaviour rather than asking how to build
something. Confirm the cause before proposing a fix; several symptoms below have
more than one plausible source.

| Symptom | Most likely cause | Where to look |
| --- | --- | --- |
| Nothing renders, container is empty | Container has no height, or init ran before the element existed | `framework-integration.md` |
| Two editors / doubled panels, only in dev | React StrictMode double-mount without a guard and `destroy()` | `framework-integration.md` |
| Custom component behaves like a plain div after reload | Type registered after content was loaded, or `isComponent` doesn't match the serialized output | `components.md` |
| `script` throws "x is not defined" | Closure captured; script runs in the canvas frame | `components.md` |
| Script doesn't re-run when a setting changes | Value isn't a declared script prop, or trait writes an attribute instead of a model prop | `components.md`, `traits.md` |
| Block drops as raw HTML, loses its type | `content` passed as a string instead of a component definition | `blocks.md` |
| Users can drop anything anywhere | Drop rules missing on the component model | `blocks.md`, `components.md` |
| Trait edit changes nothing visible | Trait wrote an attribute nobody reads; needs `changeProp` | `traits.md` |
| Settings panel shows stale values | Custom trait type missing `onUpdate` | `traits.md` |
| Style applies in canvas, missing in export | Rule written under a device media query or a state | `styling-canvas.md` |
| Style doesn't apply at all | Wrong style target (class vs id), or property restricted by the model | `styling-canvas.md` |
| Fonts fall back inside the canvas only | Font not injected as a canvas style | `styling-canvas.md` |
| Tailwind classes work in dev, dead in production | Purge stripped classes only end-users reference | `styling-canvas.md` |
| Work lost after reload | Export stored instead of project data, or a silent save failure | `storage-export.md` |
| Save requests flood the API | `stepsBeforeSave` at 1 with autosave | `storage-export.md` |
| Project JSON grows until saves time out | Assets stored as base64 rather than uploaded | `storage-export.md` |
| Editor breaks after adding a second plugin | Name collision on component types, blocks or commands | `plugin-authoring.md` |
| `instanceof` checks fail, odd module errors | Two copies of grapesjs — core bundled as a dependency somewhere | `plugin-authoring.md` |
| Crash on SSR / "window is not defined" | Editor module imported on the server | `framework-integration.md` |
| Devtools can't find the edited elements | Looking in the host document, not the canvas frame | `styling-canvas.md` |
| Project JSON full of `data:image/...` | No `upload` or `uploadFile` configured — base64 is the default | `assets.md` |
| Upload succeeds but nothing appears in the panel | Server response doesn't match the `{ data: [...] }` shape `autoAdd` expects | `assets.md` |
| Upload progress/error UI never fires | Custom `uploadFile` doesn't emit the `asset:upload:*` events | `assets.md` |
| Only the current page ends up published | Export reads the selected page; pages not iterated | `pages-i18n.md` |
| Editor UI stays English after setting a locale | `messages` used instead of `messagesAdd`, or a mistyped message key | `pages-i18n.md` |
| Select trait shows translated label, untranslated options | `traitManager.traits.options` not provided | `pages-i18n.md` |
| Panel button does nothing | Button's `command` isn't registered, or the id is misspelled | `panels-ui.md` |
| Toggle button won't un-toggle | Command defines `run` but no `stop` | `panels-ui.md` |
| Styling one element restyles every element sharing its class | `componentFirst` left at its default of `false` | `panels-ui.md` |
| Handler fires hundreds of times on load | `component:add` also fires during project load | `events-commands.md` |
| Keyboard shortcut ignored while editing in the canvas | Host-document `keydown` listener instead of a keymap | `events-commands.md` |
| Programmatic setup shows up in the user's undo history | Seeding not wrapped in `UndoManager.stop()`/`start()` | `events-commands.md` |
| Double-click doesn't start text editing | Component isn't `editable` / isn't based on `text` | `rte.md` |
| Third-party RTE toolbar is clipped or unclickable | Toolbar rendered inside the canvas iframe | `rte.md` |
| Bound values render blank in the editor | `data-variable` without a `defaultValue` | `data-sources.md` |
| Playwright "element not found" for canvas content | Missing `frameLocator` | `testing.md` |

## Diagnostic order

1. Which layer — core, Studio SDK, or a preset plugin? Fixes differ.
2. Which version? Check with `${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh --version`.
   Many "the docs are wrong" reports are version drift.
3. Reproduce in isolation: a bare init with no plugins and one component. Half of
   reported core bugs are preset-plugin interactions.
4. Inspect the canvas frame's document, not the host page.
5. Compare canvas rendering against the exported HTML/CSS. If they disagree, the
   bug is in serialization; if they agree, it's in authoring.
