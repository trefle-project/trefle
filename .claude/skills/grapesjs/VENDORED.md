# Provenance

Vendored (not a submodule) from:

- Source: https://github.com/GJS-market/grapesjs-claude-skill
- Path: `plugins/grapesjs/skills/grapesjs`
- Commit: `f03cacea7cf5ff146a3b625b64c10a0c007cf420`
- Date: 2026-08-07
- License: MIT (see `LICENSE` in this directory)

Verified by upstream against `grapesjs` 0.23.x / `@grapesjs/studio-sdk` 1.x.
Our `apps/cms` pins `grapesjs` 0.22.16 — close enough that the API surface
described here holds; `scripts/gjs-api.sh` cross-checks against whatever is
actually installed rather than relying on this note.

To update: re-clone the source repo, diff its
`plugins/grapesjs/skills/grapesjs` against this directory, and bump the
commit/date above.
