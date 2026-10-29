# Contract: `leads.language` at lead-intake time

`POST /api/lead-intake` — the cross-app contract between `apps/web` (the
caller, using the `service` API key) and `apps/cms` (`leadIntakeEndpoint`,
`apps/cms/src/endpoints/leadIntake.ts`).

## What does NOT change

- **Request body**: unchanged. `apps/web` does not send a language — there
  is no visitor-facing language input to add, per FR-007 ("no additional
  input required from the visitor").
- **Response body**: unchanged. `language` is not echoed back; nothing in
  the current response consumers (`apps/web`'s submit handler) needs it.

## What changes, server-side only

`leadIntakeEndpoint` already loads the target page at `depth: 1`
(`payload.findByID({ collection: "pages", id: pageId, depth: 1, ... })`),
which resolves `page.language` to the full `languages` document (not just
its id) — exactly like `page.domain` and `page.confirmationPage` are
already resolved and read in this same handler.

The `payload.create({ collection: "leads", ... })` call gains one field:

```ts
language: typeof page.language === "object" && page.language ? page.language.code : "fr",
```

`leads.language` is `required: true` (matching `pages.language`, both
enforced belt-and-suspenders at the DB level too — research.md §5), so the
fallback needs a concrete string rather than `undefined`. `page.language`
is only ever a bare id, never a resolved object, if the page somehow
predates the migration backfill — not possible in practice, since the
migration backfills every existing page before this code can run against
it — so the `"fr"` fallback is defensive only, matching how
`domainHostname`'s own fallback chain already handles the analogous "field
unexpectedly missing" case.

## Guarantee

Once written, `leads.<id>.language` is never updated by any code path —
`leadIntakeEndpoint` is (per `Leads.ts`'s own header comment) the *only*
writer of `leads` rows at creation, and no hook or endpoint elsewhere
touches this field afterward (FR-008).
