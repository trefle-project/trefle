# Assets

The asset manager is the image picker and the upload pipeline. Its default is the
single most expensive misconfiguration in GrapesJS.

## The base64 default

**With no `upload` endpoint and no `uploadFile` function configured, dropped files
are embedded as base64 directly into the project JSON.** Nothing warns you. It
works perfectly in a demo, and then:

- Project JSON grows by ~1.4× the byte size of every image the user drops.
- Saves get slower, then hit request-size limits, then time out.
- The failure surfaces weeks in, on the accounts with the most content — the ones
  you least want to lose.

Configure uploads before anyone touches the editor. This is not an optimization.

## Wiring an upload endpoint

The declarative path, when you have a plain HTTP endpoint:

```js
grapesjs.init({
  assetManager: {
    upload: '/api/assets',
    uploadName: 'files',
    headers: { 'X-CSRF-Token': token },
    credentials: 'include',
    multiUpload: true,
  },
});
```

`autoAdd` defaults to **true**, which means the server must answer with JSON
shaped as `{ data: [...] }`, each entry either a URL string or an object with
`src`. A server that returns anything else uploads the file successfully and then
shows nothing in the panel — a confusing half-failure. Match the shape, or set
`autoAdd: false` and add assets yourself from `asset:upload:response`.

`customFetch` swaps the transport while keeping the rest of the pipeline:

```js
assetManager: {
  customFetch: (url, options) => axios(url, { data: options.body }),
}
```

## Full control: `uploadFile`

**Requires grapesjs 0.22+.** On 0.21.x use `customFetch`, or the `upload`
endpoint with a server-side adapter.

When you need presigned S3 URLs, client-side resizing, progress, or a non-HTTP
backend, take over completely:

```js
assetManager: {
  uploadFile: async (ev) => {
    const files = ev.dataTransfer ? ev.dataTransfer.files : ev.target.files;
    for (const file of files) {
      const { url, publicUrl } = await getPresignedUrl(file.name, file.type);
      await fetch(url, { method: 'PUT', body: file });
      editor.Assets.add({ src: publicUrl, name: file.name, type: 'image' });
    }
  },
}
```

The catch, and it is documented in the typings: **`uploadFile` gives you total
control, which means you are also responsible for emitting the `asset:upload:*`
events yourself.** Skip that and any UI you built on those events — progress
bars, error toasts — silently never fires. If you only need a different
transport, `customFetch` keeps the events for you.

## Opening the picker

```js
editor.Assets.open({
  types: ['image'],
  accept: 'image/*',
  select(asset, complete) {
    component.set('src', asset.getSrc());
    complete && editor.Assets.close();
  },
});
```

This is how a custom trait offers an image field — build the trait with
`Traits.addType` (see `traits.md`) and call `Assets.open` from its input handler,
rather than reimplementing a picker.

Module surface: `add`, `get`, `getAll`, `getAllVisible`, `remove`, `open`,
`close`, `render`, and `addType` / `getType` / `getTypes` for custom asset kinds
(video, documents, a linked media library).

## Events

| Event | Use |
| --- | --- |
| `asset:upload:start` | show progress |
| `asset:upload:end` | hide progress, refresh |
| `asset:upload:error` | surface the failure — otherwise the drop just does nothing |
| `asset:upload:response` | inspect or rewrite the server response |
| `asset:add` / `asset:remove` | keep your own media library in sync |
| `asset:open` / `asset:close` | picker visibility |

`asset:upload:error` is the one people skip. A failed upload with no handler is
indistinguishable from a slow one.

## Assets and project data

Assets are stored in project data as URLs. Two consequences:

- **Deleting an asset from your CDN breaks every project referencing it.** The
  project JSON has no copy. Soft-delete, or reference-count before purging.
- **Assets are per project by default.** A shared, tenant-wide media library is
  your own concern: load it into the manager on init with `Assets.add`, and keep
  your source of truth outside the project JSON.

## Checklist

1. `upload` or `uploadFile` configured — verify by dropping an image and checking
   that the project JSON contains a URL, not `data:image/...`.
2. `uploadFile` implementations emit `asset:upload:*` events.
3. `asset:upload:error` handled visibly.
4. Server response shape matches what `autoAdd` expects, if used.
5. Auth headers/credentials pass through to the upload request.
6. CDN deletion policy accounts for projects still referencing the URL.
