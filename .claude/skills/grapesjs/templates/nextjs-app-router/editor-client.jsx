// GrapesJS in the Next.js App Router.
//
// GrapesJS touches `window` and `document` at import time, so it cannot run on
// the server. Two files: this client component, and a page that imports it with
// SSR disabled.
//
// app/builder/editor-client.jsx  <- this file
// app/builder/page.jsx           <- see the bottom of this file

'use client';

import { useEffect, useRef, useState } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

export default function EditorClient({ projectId }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (editorRef.current) return; // StrictMode double-mount guard

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      fromElement: false,
      storageManager: false, // wire your own; see templates/react-vite
    });

    editor.once('load', () => setReady(true));
    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, []);

  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column' }}>
      {!ready && <div>Loading editor…</div>}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}

/* ---------------------------------------------------------------------------
app/builder/page.jsx

  import dynamic from 'next/dynamic';

  // ssr: false is the whole point — without it the build fails with
  // "window is not defined".
  const EditorClient = dynamic(() => import('./editor-client'), {
    ssr: false,
    loading: () => <p>Loading editor…</p>,
  });

  export default function BuilderPage() {
    return <EditorClient projectId="demo" />;
  }

Note: `ssr: false` in `next/dynamic` is only allowed from a Client Component.
If `page.jsx` is a Server Component, either add 'use client' to it, or keep the
dynamic import inside another client component.
--------------------------------------------------------------------------- */
