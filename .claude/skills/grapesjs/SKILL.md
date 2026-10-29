---
name: grapesjs
description: >-
  Expert guidance for building with GrapesJS and the GrapesJS Studio SDK —
  custom component types, blocks, traits, editor events and commands, storage
  and export, React/Vue/Next.js integration, canvas and styling problems,
  panels, assets, pages, i18n, rich text, data sources, and authoring
  distributable GrapesJS plugins.
when_to_use: >-
  Use whenever the user is working with GrapesJS. Triggers include any file
  importing 'grapesjs', '@grapesjs/studio-sdk' or a 'grapesjs-*' package; the
  APIs editor.DomComponents / editor.Components, BlockManager, TraitManager,
  StorageManager, CssComposer, DataSources; grapesjs.init(); a repo that
  already embeds a GrapesJS editor; or the user naming GrapesJS or Studio SDK
  directly. Also use for symptoms in a GrapesJS project — "my styles don't
  apply in the canvas", "users lose their work after reload", "my custom
  component turns into a plain div".
license: MIT
allowed-tools: 'Bash(${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh *) Bash(rg *) Bash(grep *) Bash(node -p *) Bash(node -e *)'
---

# GrapesJS

GrapesJS is an engine, not a finished product. It gives you a canvas, a component
tree, a style engine and a plugin API. Hosting, auth, publishing and persistence
are the integrator's job. Most bugs come from four places: guessed API names,
the canvas iframe boundary, confusing project state with exported HTML, and
component `script` closures.

**Verified against `grapesjs` 0.23.x and `@grapesjs/studio-sdk` 1.x.** The API
stated in these files is real, not recalled. Versions still drift — see Rule 0.

## Rule 0 — state the API, then verify it

Write the call using the API in these references, then confirm it against the
typings actually installed in the project:

```bash
${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh --version                       # installed versions
${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh --type AddComponentTypeOptions  # full option shape
${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh --events                        # every typed event enum
${CLAUDE_SKILL_DIR}/scripts/gjs-api.sh addType                         # grep the typings
```

`--type` is the one that matters most: it prints the whole interface, so you can
write a correct call instead of a plausible one.

If the project is greenfield and GrapesJS is not installed yet, the references
below are the source of truth — do not stall on a lookup you cannot perform. If
`${CLAUDE_SKILL_DIR}` appears unexpanded (the skill is running somewhere that
does not substitute it), grep `node_modules/grapesjs/dist/index.d.ts` directly.

Never invent a method or config key. If it is not in the typings and not in these
references, say so rather than substituting a similar-looking name.

## Module names

Every module has a short getter on the editor and a longer legacy alias. Both
resolve; the short form is current. Reference files use the short form.

| Current | Legacy alias | Covers |
| --- | --- | --- |
| `editor.Components` | `editor.DomComponents` | component types, the tree |
| `editor.Blocks` | `editor.BlockManager` | the palette |
| `editor.Traits` | `editor.TraitManager` | the settings panel |
| `editor.Styles` | `editor.StyleManager` | style sectors and properties |
| `editor.Css` | `editor.CssComposer` | CSS rules |
| `editor.Storage` | `editor.StorageManager` | persistence |
| `editor.Assets` | `editor.AssetManager` | uploads and the asset picker |
| `editor.Pages` | `editor.PageManager` | multi-page projects |
| `editor.Devices` | `editor.DeviceManager` | breakpoints and previews |
| `editor.Selectors` | `editor.SelectorManager` | classes and states |
| `editor.Layers` | `editor.LayerManager` | the layer tree |
| `editor.Panels` | `editor.PanelManager` | editor chrome |

`editor.Commands`, `Keymaps`, `Modal`, `I18n`, `UndoManager`, `RichTextEditor`,
`Canvas`, `Parser` and `DataSources` have no alias.

## Orientation

Three layers, often confused:

| Layer | What it is |
| --- | --- |
| `grapesjs` | Open-source core. Free, you assemble the editor yourself. |
| Studio SDK (`@grapesjs/studio-sdk`) | Commercial, ready-made editor built on the core, embedded in your app. Licensed. |
| Studio (app.grapesjs.com) | Hosted standalone product wrapping the SDK. |

Ask which one the user is on before proposing an approach. Studio SDK code is
configured through its own options object and still extensible through the core
API — do not mix the two config shapes.

## Route to the right reference

Read only the file you need. Each is self-contained.

| Task | File |
| --- | --- |
| Custom component types, `addType`, `isComponent`, `script`, view lifecycle | `references/components.md` |
| Blocks in the palette, drag-and-drop, categories, drop rules | `references/blocks.md` |
| Traits (settings panel), custom trait types, binding to attributes/props | `references/traits.md` |
| Editor events, commands, keymaps, undo/redo, reacting to user actions | `references/events-commands.md` |
| Saving, loading, autosave, custom storage adapters, export HTML/CSS | `references/storage-export.md` |
| Mounting in React, Vue, Next.js, StrictMode double-mount, cleanup | `references/framework-integration.md` |
| "My CSS doesn't apply", devices, states, selectors, fonts, Tailwind in canvas | `references/styling-canvas.md` |
| Panels, buttons, modals, replacing the editor UI, driving it from your own chrome | `references/panels-ui.md` |
| Image uploads, the asset picker, base64 bloat, custom asset backends | `references/assets.md` |
| Multi-page projects, publishing every page, translating the editor UI | `references/pages-i18n.md` |
| Rich text editing, swapping in TipTap/Quill, custom RTE actions | `references/rte.md` |
| Data sources, data variables, collections, conditional content | `references/data-sources.md` |
| Writing a distributable GrapesJS plugin, build setup, TS types | `references/plugin-authoring.md` |
| Studio SDK configuration, license, plugins, project types | `references/studio-sdk.md` |
| Testing a GrapesJS integration, what jsdom can't do, Playwright patterns | `references/testing.md` |
| Symptom → cause table for common breakage | `references/troubleshooting.md` |

Working starters live in `templates/` — `react-vite`, `nextjs-app-router` and
`plugin-package`. Prefer adapting one over writing an integration from scratch.

**Sibling skill:** `/grapesjs:plugin-readme` writes or improves the README for a
GrapesJS plugin package, building the options table from the plugin's real
source. Hand off to it whenever the task is documenting a `grapesjs-*` package.

## Non-negotiables

These cause the majority of hard-to-debug failures. Apply them always.

**The canvas is an iframe.** Styles and scripts the rendered content needs must
be injected through the editor's `canvas.styles` / `canvas.scripts` config, not
added to the host page. Fonts, CSS resets and runtime libraries all cross this
boundary.

**Component `script` is serialized to a string.** It runs inside the canvas
frame and cannot capture the surrounding closure. Anything it needs must be
passed through `'script-props'`. Inside the function, `this` is the DOM element.
A `script` that references an imported symbol or an outer variable will throw at
runtime and pass your type checker — this bug is invisible until you drag the
component.

**Project state is not the export.** `editor.getProjectData()` returns JSON for
restoring the editing session; `editor.getHtml()` / `editor.getCss()` produce the
publishable artifact. Persist the first, publish the second, never substitute one
for the other.

**Define custom types before loading content.** If content referencing a custom
type is loaded before the type is registered, those nodes degrade to plain
elements and lose their behaviour permanently in that session.

**IDs are not stable across export.** Do not build integrations that rely on
generated component IDs surviving a load/store round trip. Use attributes or
custom props for anything you need to look up later.

## Working style

- Prefer extending an existing component type with `extend` over inventing a new
  one from scratch; inherit and override only what changes.
- Prefer declarative model defaults over imperative view code. Reach for a
  custom `view` only when you need real DOM lifecycle control.
- When a change should show up in the export, verify it in `getHtml()`/`getCss()`,
  not just in the canvas. The canvas has editor-only decorations.
- Reproduce styling complaints by checking the active device and state first —
  that is the cause more often than any other single thing.
- After non-trivial edits, suggest verifying in a real editor session, since the
  canvas has behaviour no unit test covers.
