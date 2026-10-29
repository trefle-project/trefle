# Storage and export

Two different artifacts. Getting them confused is the most expensive GrapesJS
mistake, because it usually surfaces after users have created content.

| | Project data | Export |
| --- | --- | --- |
| Shape | JSON: components, styles, pages, assets | HTML + CSS strings |
| Purpose | Restore an editing session | Publish / render to end users |
| Read with | `editor.getProjectData()` | `editor.getHtml()`, `editor.getCss()` |
| Restore with | `editor.loadProjectData(data)` | — (not restorable) |
| Store as | JSON column / document | Files, CDN, template store |

Persist project data. Derive the export from it when publishing. Never store
only the HTML and try to reconstruct an editable project from it — the component
tree, custom types and style rules will not survive.

## Storage manager

Configured at init. The knobs that matter:

- **type** — which storage backend is active, or disabled entirely.
- **autosave** — save after changes.
- **stepsBeforeSave** — how many changes trigger one save. Left at 1 in
  production it will hammer your API; a page builder generates changes on every
  drag frame in some flows.
- **autoload** — load on init.

For anything beyond a toy, write a custom storage adapter rather than using the
built-in remote endpoints. You get auth headers, error handling, tenancy and
optimistic concurrency, none of which the built-in gives you.

`Storage.add(type, storage)` registers one. The object implements `load` and
`store`, both returning promises:

```js
editor.Storage.add('my-backend', {
  async load(options = {}) {
    const res = await fetch(`/api/projects/${options.projectId}`);
    if (!res.ok) throw new Error(`load failed: ${res.status}`);
    return res.json();          // must return the project data object
  },
  async store(data, options = {}) {
    const res = await fetch(`/api/projects/${options.projectId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`store failed: ${res.status}`);
  },
});
```

Then point the storage manager at it, and whatever else you put in the config is
passed through to your adapter as `options`:

```js
grapesjs.init({
  storageManager: {
    type: 'my-backend',
    autosave: true,
    stepsBeforeSave: 10,
    autoload: true,
    projectId: currentProjectId,   // reaches load()/store() as options.projectId
  },
});
```

Register the adapter **before** `init` runs with `autoload: true`, or the first
load fires against a storage type that does not exist yet.

## Failure handling is your job

A rejected `store` does not tell the user anything by default. The storage events
are what you build a save indicator on:

| Event | Use |
| --- | --- |
| `storage:start:store` | show "saving…" |
| `storage:end:store` | show "saved", stamp the time |
| `storage:error` / `storage:error:store` / `storage:error:load` | show the failure, offer retry |
| `storage:end:load` | project is ready |

```js
editor.on('storage:start:store', () => setSaveState('saving'));
editor.on('storage:end:store',   () => setSaveState('saved'));
editor.on('storage:error',       (err) => setSaveState('error', err));
```

Silent save failure in a page builder is a data-loss bug, and users will close
the tab believing their work is safe.

Also handle: the project loading as empty because the backend 404'd, a partial
save during navigation, and two tabs editing the same project.

## Assets

Uploaded images are a separate concern from project data. **With no `upload`
endpoint and no `uploadFile` function configured, the asset manager embeds
dropped files as base64** — that is the default, and it is the mechanism behind
projects whose JSON grows until saves time out. Wire it to your own endpoint and
store URLs. Details in `assets.md`.

## Export

- `editor.getHtml()` returns markup for the current page.
- `editor.getCss()` returns the collected rules, including media queries for the
  devices you configured.
- `editor.getJs()` returns the collected component `script` output.

Options worth knowing, because each fixes a specific complaint:

| Option | On | Effect |
| --- | --- | --- |
| `keepUnusedStyles` | `getCss` | **Keeps rules no component currently matches.** This is the fix when the export looks different from the canvas — GrapesJS prunes unmatched rules by default and takes hand-written or injected CSS with them. |
| `onlyMatched` | `getCss` | The opposite: emit only rules the passed component uses. Good for per-component export. |
| `avoidProtected` | `getCss` | Skip the editor's protected CSS block. |
| `component` | both | Export one subtree instead of the whole page. |
| `cleanId` | `getHtml` | Strip auto-generated IDs. Do this for published output; keep them if anything downstream targets them. |
| `json` | `getCss` | Return `CssRule[]` instead of a string. |

Inline `script` from components ends up in the export when present; make sure it
is safe to run outside the editor.

For email output, the plain export is not enough — you need inline styles and
table layout, which is what the MJML/newsletter presets and the Studio SDK email
mode exist for. Do not hand-roll this.

## Multi-page

`getHtml()` and `getCss()` operate on the **currently selected page**. Project
data holds all of them. Exporting only the current page and calling it a site is
a common oversight — iterate explicitly. See `pages-i18n.md` for the loop.

## Checklist

1. Project data persisted, export derived — not the other way round.
2. `stepsBeforeSave` tuned; saves are not fired per keystroke.
3. Save failures visible to the user.
4. Assets uploaded to storage, URLs referenced.
5. Load path tested against an empty project and a corrupt one.
6. Round trip verified: save → hard reload → everything is still editable.
