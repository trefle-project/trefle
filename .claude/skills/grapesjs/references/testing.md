# Testing a GrapesJS integration

The canvas is a real iframe with a real layout engine. That single fact decides
what is worth testing where, and it is why most GrapesJS test suites either don't
exist or test the wrong layer.

## What runs where

| Layer | Environment | Verdict |
| --- | --- | --- |
| Model logic: component defaults, `isComponent`, `toHTML`, storage adapters | jsdom / node | Fast and reliable. Test heavily. |
| Round trips: project data → load → export | jsdom | Works, high value per test. |
| Drag and drop, resizing, the RTE toolbar, device previews | jsdom | **Does not work.** No real layout, no drag events, no frame geometry. Don't try. |
| Anything visual or pointer-driven | Playwright | The only honest option. |

The failure mode to avoid is mocking the editor until the test passes. A test
that mocks `DomComponents` proves your mock works.

## Headless model tests

`grapesjs.init` needs a DOM but not a visible one. In jsdom, give it a real
container and `headless: true` where you don't need the UI:

```js
import grapesjs from 'grapesjs';

function makeEditor(opts = {}) {
  document.body.innerHTML = '<div id="gjs"></div>';
  return grapesjs.init({
    container: '#gjs',
    storageManager: false,       // no autosave during tests
    plugins: [myPlugin],
    ...opts,
  });
}
```

Turn `storageManager` off unless the test is about storage. Left on, tests fire
saves at whatever backend the config names.

### The round trip — the highest-value test you can write

This catches the `isComponent` mismatch described in `components.md`, which is
otherwise invisible until a user reloads:

```js
test('custom type survives a save/load round trip', () => {
  const editor = makeEditor();
  editor.addComponents({ type: 'pricing-card', components: [{ type: 'text', content: 'Pro' }] });

  const saved = editor.getProjectData();

  const reloaded = makeEditor();
  reloaded.loadProjectData(saved);

  const found = reloaded.getWrapper().find('[data-gjs-type="pricing-card"]');
  expect(found).toHaveLength(1);
});
```

And the export-parse round trip, which catches the same bug from the other side:

```js
test('exported HTML re-parses as the custom type', () => {
  const a = makeEditor();
  a.addComponents({ type: 'pricing-card' });
  const html = a.getHtml();

  const b = makeEditor();
  b.setComponents(html);
  expect(b.getWrapper().find('[data-gjs-type="pricing-card"]')).toHaveLength(1);
});
```

If the second one fails, `isComponent` does not match what the type serializes
to. That is the bug, every time.

### Storage adapters

Test them as plain objects, without an editor at all — they're just `load` and
`store` returning promises. Cover: success, non-2xx, network rejection, and an
empty/404 load returning something the editor can accept.

### Other cheap, high-value assertions

- Every registered block's `content`, when added, produces the component type you
  expect (`editor.Blocks.getAll()` → add each → check the tree).
- `getCss()` contains the media queries for your configured devices.
- A trait with `changeProp: true` actually changes the model property.
- Your plugin runs twice without throwing or duplicating blocks — the idempotence
  rule from `plugin-authoring.md`, and a one-line test.

## Playwright for the canvas

Everything real happens in a frame. Address it explicitly:

```ts
const canvas = page.frameLocator('iframe');   // the GrapesJS canvas
await expect(canvas.locator('.hero')).toBeVisible();
```

Forgetting `frameLocator` and getting "element not found" is the single most
common Playwright-with-GrapesJS mistake — the same one described in
`troubleshooting.md` as "devtools can't find the edited elements".

Drag and drop needs real mouse steps; the `dragTo` shortcut is unreliable against
GrapesJS's own drag implementation:

```ts
// Locate the block by its visible label — the block element's own classes are
// built from the editor's style prefix and are not a stable contract.
const block = page.getByText('Hero', { exact: true });

await block.hover();
await page.mouse.down();
await page.mouse.move(400, 300, { steps: 20 });   // steps matter — GrapesJS tracks movement
await page.mouse.up();
```

Prefer waiting on editor state over waiting on pixels:

```ts
await page.waitForFunction(() => window.editor.getComponents().length > 0);
```

Expose the instance for tests (`window.editor = editor` behind a flag) — asserting
against the model is far less flaky than asserting against rendered DOM, and it
lets you skip the drag entirely for tests that aren't about dragging.

## Testing a distributable plugin

Ship a test that initializes a bare editor with only your plugin, and asserts what
it registered. It doubles as the compatibility check when a new GrapesJS version
lands:

```js
test('registers its types and blocks', () => {
  const editor = makeEditor({ plugins: [myPlugin], pluginsOpts: { [myPlugin]: {} } });
  expect(editor.Components.getType('my-card')).toBeTruthy();
  expect(editor.Blocks.get('my-card-block')).toBeTruthy();
});
```

Run it against the oldest and newest GrapesJS in your `peerDependencies` range.
That range is a claim you are making; this is how you check it.

## Checklist

1. Round-trip tests exist for every custom component type.
2. `storageManager: false` in tests that aren't about storage.
3. Storage adapters tested for failure paths, not just the happy one.
4. No test mocks core editor modules.
5. Canvas assertions go through `frameLocator`.
6. Drag tests use stepped mouse movement, not `dragTo`.
7. E2E waits on editor state, not timeouts.
8. Plugins tested against both ends of their peer range.
