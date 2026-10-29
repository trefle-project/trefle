# Templates

Working starting points, not scaffolds. Read and adapt them; they encode the
rules from the reference files rather than restating them.

| Directory | Use when |
| --- | --- |
| `react-vite/` | Any client-side React app. Guarded init, `destroy()` cleanup, storage adapter and asset upload already wired. |
| `nextjs-app-router/` | Next.js App Router. Shows the `'use client'` + `dynamic(..., { ssr: false })` pair that keeps GrapesJS off the server. |
| `plugin-package/` | Publishing a `grapesjs-*` npm package. ESM + UMD + types, `grapesjs` externalized and in `peerDependencies`. |

For Vue, follow `react-vite` with `onMounted` / `onBeforeUnmount`, and keep the
editor instance out of `ref`/`reactive` — see `references/framework-integration.md`.

Every template assumes `grapesjs` is installed in the host project; none of them
bundle it.
