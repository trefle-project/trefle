import { defineConfig } from 'vite';

// Library mode, ESM + UMD, with grapesjs externalized.
//
// Bundling grapesjs instead of externalizing it is the #1 packaging bug: the
// consumer ends up with two copies of the core, `instanceof` checks fail, and
// components registered against one instance are invisible to the other.

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'grapesjsMyPlugin',        // UMD global
      fileName: (format) => (format === 'es' ? 'index.js' : 'index.umd.cjs'),
      formats: ['es', 'umd'],
    },
    rollupOptions: {
      external: ['grapesjs'],
      output: {
        globals: { grapesjs: 'grapesjs' },
      },
    },
  },
});
