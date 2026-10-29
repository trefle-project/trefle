# Contract delta: lead intake gains a confirmation page

Base contracts: `specs/001-landing-page-lead-capture/contracts/lead-intake.md`
(`POST /api/leads`, owned by `apps/web`) and
`specs/001-landing-page-lead-capture/contracts/payload-collections.md` §B
(`POST /api/lead-intake`, owned by `apps/cms`). Only the deltas below change;
everything else in those contracts (request shape, rate limiting, honeypot,
timing/consent checks, retry-then-503 behaviour) is unchanged.

## `POST /api/lead-intake` (CMS, service-key only) — response delta

Adds one optional field to the existing success body:

| Field | Req | Notes |
|---|---|---|
| `confirmationPage` | no | present only when the submitted page's `confirmationPage` relationship is set; `{ id, path, domain: { hostname } }` — enough for the renderer to look the page up through the normal published-page path, not an inline content dump |

Unchanged: `ok`, `leadId`, `unsubscribeUrl`, `successMessage`, `duplicate`.

## `POST /api/leads` (renderer, public) — behaviour delta

Step 9 of the base contract ("`200 OK` → server-rendered success page showing
`successMessage` + the unsubscribe link") becomes conditional:

- **If** the CMS response includes `confirmationPage`: fetch that page via the
  same published-page lookup the renderer already uses
  (`getPublishedPage(domain.id, confirmationPage.path)`), render it through
  the normal `PageShell` path (same as any other page — full block content,
  not a stripped-down fragment), and substitute the literal token
  `{{unsubscribeUrl}}` anywhere it appears in the rendered output with the
  real `unsubscribeUrl` from the intake response. If the confirmation page
  itself cannot be resolved (e.g. deleted/unpublished since being selected),
  fall back to the generic message rather than error the submission.
- **Else** (no `confirmationPage`, matching today for every page that hasn't
  set one): unchanged — the existing inline "Merci..." fragment with the
  optional unsubscribe line.

No change to non-2xx responses (403/409/422/429/503) — a confirmation page is
only ever relevant to the success path.
