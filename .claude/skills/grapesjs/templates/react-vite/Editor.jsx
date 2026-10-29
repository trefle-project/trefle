// Minimal, correct GrapesJS mount for React (Vite, CRA, any client-side React).
// The three things that matter: init once, destroy on unmount, real height.
//
// npm i grapesjs

import { useEffect, useRef, useState } from 'react';
import grapesjs from 'grapesjs';
import 'grapesjs/dist/css/grapes.min.css';

export function Editor({ projectId, onReady }) {
  const containerRef = useRef(null);
  const editorRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Guard React StrictMode's dev double-mount. Without this you get two
    // editors stacked in one container: doubled panels, drags firing twice.
    if (editorRef.current) return;

    const editor = grapesjs.init({
      container: containerRef.current,
      height: '100%',
      width: 'auto',
      fromElement: false,

      // The canvas is an iframe: anything the content needs goes here,
      // not in your app's <head>.
      canvas: {
        styles: ['/canvas.css'],
        scripts: [],
      },

      storageManager: {
        type: 'my-backend',
        autosave: true,
        stepsBeforeSave: 10,
        autoload: true,
        projectId,
      },

      assetManager: {
        // Without an upload target, dropped images are embedded as base64 and
        // will eventually make saves time out.
        upload: '/api/assets',
        uploadName: 'files',
      },
    });

    // Register the storage adapter before autoload fires.
    editor.Storage.add('my-backend', {
      async load(options = {}) {
        const res = await fetch(`/api/projects/${options.projectId}`);
        if (!res.ok) throw new Error(`load failed: ${res.status}`);
        return res.json();
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

    editor.once('load', () => {
      setReady(true);
      onReady?.(editor);
    });

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
    // Empty deps on purpose. Putting `projectId` here would tear down and
    // rebuild the editor on every prop change — load the new project through
    // editor.load() instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!ready && <div>Loading editor…</div>}
      {/* The container needs a real height. `height: '100%'` inside a
          zero-height parent is the most common "nothing renders" report. */}
      <div ref={containerRef} style={{ flex: 1, minHeight: 0 }} />
    </div>
  );
}
