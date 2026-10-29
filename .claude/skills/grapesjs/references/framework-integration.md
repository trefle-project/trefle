# Framework integration

GrapesJS owns a DOM subtree and an iframe. Every framework problem below is the
same problem: the framework wants to re-render, GrapesJS wants to be left alone.

## The rules

1. Initialize **once**, in a mount effect with an empty dependency list.
2. Destroy on unmount, always.
3. Give it a ref'd container element, never a document-wide selector.
4. Keep editor state out of framework state. Read it through the editor
   instance; do not mirror the component tree into your store.
5. Nothing that re-runs the init effect may live in its dependencies —
   especially not inline option objects or callbacks.

## React

```jsx
import { useEffect, useRef, useState } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

export function Editor({ projectId }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (editorRef.current) return;              // guard StrictMode double-mount

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      fromElement: false,
      storageManager: { /* … */ },
    });

    editorRef.current = editor;
    editor.on('load', () => setReady(true));

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  return <div ref={containerRef} style={{ height: '100vh' }} />;
}
```

**StrictMode.** In development React mounts, unmounts and remounts. Without both
the guard and a real `destroy()`, you get two editors stacked in one container:
duplicated panels, doubled event handlers, drags that fire twice. It only
reproduces in dev, which is why people ship it.

**Props that change.** Do not put `projectId` or option objects in the
dependency array — that tears down and rebuilds the editor. Load the new project
through the editor's own load path instead.

**Rendering React components inside the canvas.** Not supported by the core.
Either render plain markup and treat React as the runtime for the published
page, or use the Studio SDK's React renderer, which exists precisely for this.

## Vue

Same shape: `onMounted` to init against a `ref`'d element, `onBeforeUnmount` to
destroy. Do not make the editor instance reactive — wrapping it in `ref`/
`reactive` makes Vue proxy the whole object graph and produces bizarre failures.
Store it in a plain variable or `shallowRef`.

## Next.js / SSR

GrapesJS touches `window` and `document` at import time. It cannot run on the
server.

- Load the editor component with a dynamic import and SSR disabled.
- Keep the CSS import in the client component too.
- The app-router version needs the `'use client'` directive at the top of the
  file that imports GrapesJS.

## Styling and layout

- The editor needs a container with a real height. `height: '100%'` inside a
  parent with no height gives you a zero-height canvas — a very common "nothing
  renders" report.
- Global CSS in your app can bleed into the editor UI (not the canvas, which is
  isolated). Scope aggressive resets away from the editor container.
- Custom panels rendered by your framework should live outside the editor
  container and talk to the editor through commands and events.

## Checklist

1. Init guarded against double-mount, `destroy()` in cleanup.
2. Init effect has no volatile dependencies.
3. Container has an explicit height.
4. Editor instance kept out of reactive state.
5. SSR disabled for the editor module.
6. Tested with a full page reload, a client-side navigation away and back, and
   in dev StrictMode.
