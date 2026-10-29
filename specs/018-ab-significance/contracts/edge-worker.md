# Contract: edge Worker changes (delta on 020 `contracts/edge-worker.md`)

Research R15 (cookieless, 2026-10-20; supersedes the R1/R14 versions).

## §1 Classification

`/mesure-audience` joins the pass paths (`apps/edge/src/classify.ts`).

## §3 A/B (replaces 020 §3 steps 2–3 and 5)

- The response's random salt (`newSalt()`, 11 base64url characters, already
  used in the form token) is drawn before the decision; it is the **view
  number**.
- The version = `assignVariant(viewNumber, experimentKey, ids)` for every
  view. No cookie is read (`tf-ab-*`, `tf-visitor`, `tf_consent`) and none is
  set.
- `EXPOSURES=on` + not a declared crawler → one exposure per view
  `{ visitorId: viewNumber, experimentKey, variantId, domainId, at }`, in
  `ctx.waitUntil` (message shape unchanged).

## §9 Invariants (tested)

- A page under test sets no cookie.
- Two views of the same page draw independently (both versions appear over
  a few views); the form token of a view carries that view's number.
- With `EXPOSURES=on`, every non-crawler view of a page under test sends one
  exposure whose `visitorId` is the number inside that response's form token;
  a page without a test sends none.
