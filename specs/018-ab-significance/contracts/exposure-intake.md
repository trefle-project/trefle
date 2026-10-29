# Contract: exposure intake and lead attribution

Research R1–R3. Extends 020's `contracts/edge-ingest.md` (the batch format and
signature are unchanged).

## Renderer `POST /api/edge/exposures`

Unchanged checks (signature, `at` within 5 minutes). Then forwards
`{ exposures }` to the CMS with the service account and answers the CMS's
status and body. The 404 placeholder goes away.

## CMS `POST /api/ab-exposure-batch` (service account only)

Request: `{ "exposures": [ { "visitorId", "experimentKey", "variantId", "domainId", "at" } ] }`,
1–100 items.

- Item kept when: `visitorId` is a view number (11 base64url characters,
  R15); `experimentKey` is the
  `growthbookExperimentKey` of a `running` experiment; `variantId` is that
  test's control page or one of its variants; `domainId` is the control
  page's domain; `at` parses and is not in the future by more than 5 minutes.
  Other items are dropped (counted in `ignored`), never failing the batch.
- One `INSERT … ON CONFLICT (visitor_id, experiment_key) DO NOTHING` for the
  kept items.
- `200 { "accepted": n, "ignored": m }` (`accepted` = rows inserted). A
  malformed body → `400` (the queue retries, then dead-letters). `403` for any
  other caller.

Tests: same batch twice inserts once; a second exposure of the same visitor to
the same test with another variant is ignored (first wins); item for a
concluded test, an unknown key, a foreign page or a bad UUID ignored; 101
items → 400; non-service caller → 403.

## Lead attribution (renderer `/api/leads` → CMS `leadIntake`)

- Renderer: when the verified form token carries a view number (served by
  the edge Worker, R15), adds it as `visitorId` to what it sends to the CMS
  intake. No cookie is read. Nothing else changes in
  the lead flow (no-JS form, redirects, rate limits).
- CMS `leadIntake`: after the lead is created, if `visitorId` is present and
  the lead's page is the control or a variant of a `running` experiment,
  creates one `ab-conversions` row (`lead`, `visitorId`, `experimentKey`,
  `variant` = the page, `convertedAt` = `submittedAt`). A failure there is
  logged and never fails the lead.
- Opt-in confirmed (`leadsConfirm`, 006): sets `confirmedAt` on the lead's
  `ab-conversions` row when one exists.
- `dsrErase`, `consentWithdraw`: delete the `ab-conversions` rows of the leads
  they touch.

Tests: lead with identifier on a variant page → one attribution with that
page; a form token without a view number → none; page not under test → none; duplicate
submission handling unchanged; confirmation sets `confirmedAt`; erasure and
withdrawal delete the row; attribution failure still stores the lead.
