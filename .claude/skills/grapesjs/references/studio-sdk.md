# Studio SDK

`@grapesjs/studio-sdk` is the commercial, ready-made editor built on the
GrapesJS core, embedded directly in your application rather than in an iframe to
a hosted service. Use this file only when the project actually depends on it —
for the open-source core, the other references apply.

## When it is the right call

Choose the SDK when you need a production editor in days and the built-ins map
to your product: multi-page projects, an email/newsletter mode, a template
manager, a publish flow, and a React renderer for using your own components as
blocks. Choose the core when you need full control over every panel, have no
budget for licensing, or your editor diverges heavily from a page builder.

The SDK is licensed. A demo key works on localhost; a real key is required
before shipping on any public domain. Sort this out before building, not at
launch.

## Configuration surface

The SDK is configured through its own options object — a different shape from
`grapesjs.init()`. The areas you will touch:

| Area | Decide |
| --- | --- |
| License | Key, and where it is injected per environment |
| Project | Type (web, email, …), and identifiers |
| Storage | Where projects are persisted, autosave cadence |
| Assets | Where user uploads go |
| Theme | Editor look, brand overrides |
| Plugins | Which SDK plugins are enabled |

Storage and assets both default to arrangements suitable for trying things out.
Point them at your own infrastructure before real users touch it — the whole
point of the SDK over a hosted builder is that data stays in your stack.

The SDK playground on the vendor site lets you assemble a config interactively;
sending someone there is usually faster than describing option names, which move
between versions.

## Relationship to the core

The SDK is built on GrapesJS and remains extensible through the core API, and
existing GrapesJS plugins and custom components can be reused inside it. So:
component types, traits and commands from the other references still apply.
What differs is the shell — panels, layouts and the project model are the SDK's,
and fighting them defeats the reason for buying it.

`@grapesjs/studio-sdk-plugins` is the companion package of official SDK plugins.

## Practical notes

- Current major is `@grapesjs/studio-sdk` **1.x**, with `@grapesjs/studio-sdk-plugins`
  as the companion package.
- Pin an exact version rather than `latest`, including in a CDN script tag. The
  SDK moves fast.
- Verify option names against the installed package's typings, exactly as with
  the core. This file deliberately avoids quoting SDK option keys, because they
  change between minors — that caution is specific to the SDK. The core API in
  the other references is stated outright.
- Migrating core → SDK is not a drop-in swap: init config, storage and panel
  customization all have to be rewritten. Budget for it.
