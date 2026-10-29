# Contract: the public `dataLayer`

This is the interface a marketing operator builds GTM tags/triggers
against (spec.md User Story 3, FR-003). Field names and event names here
are the stable surface — changing them is a breaking change for whatever
is configured inside GTM.

## General rules

- Every push includes `event` (string) and `domain` (the current
  hostname). No push ever includes a submitted field value (email, name,
  phone, free text) or any other personal identifier (FR-003).
- Pushed via `window.dataLayer = window.dataLayer || []; dataLayer.push({...})`
  — either inline at SSR time (research.md §8) or, for the generic
  `page_view` on an ordinary page render, by `<Tagging>` itself.
- Fires on every publicly rendered page (ordinary pages, the confirmation
  page, `/unsubscribe`, `/confirm`) — never on preview links or the
  Payload admin UI (FR-010).

## Events

| Event | When | Fields |
|---|---|---|
| `page_view` | Any public page finishes rendering | `domain`, `path`, `pageType` (`landing`/`confirmation`/other — from `004-page-types`, when applicable; omitted for `/unsubscribe`/`/confirm`) |
| `lead_form_view` | A page with a lead-capture form is rendered to the visitor | `domain`, `path`, `formPageId` (the page's id — an opaque identifier, not personal data) |
| `lead_form_submit_success` | A lead-form submission is accepted | `domain`, `path`, `formPageId` |
| `lead_form_submit_error` | A lead-form submission is rejected | `domain`, `path`, `formPageId`, `reason` — one of a fixed, non-personal set: `validation_failed`, `consent_not_given`, `rate_limited`, `upstream_unavailable`. Never a field name or the submitted value that failed (spec.md Edge Cases). |
| `unsubscribe_complete` | The unsubscribe flow succeeds | `domain` |

## Non-goals

- No event for the double opt-in `/confirm` link beyond the generic
  `page_view` every public page already gets — not part of spec.md's User
  Story 3 scope.
- No automatic e-commerce/enhanced-conversion schema — out of scope
  (spec.md Context: building tags/triggers/variables inside GTM is a
  marketing-operations task, not this codebase's).
