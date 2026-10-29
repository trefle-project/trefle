# Contract delta: publish validation becomes per-`pageType`

**Owner**: `apps/cms` · **Surface**: `pages-publish-guard.ts` (a
`beforeChange` collection hook — not a separate HTTP endpoint; it rejects a
`PATCH`/`POST` to `/api/pages/*` that sets `status: "published"` by
throwing a `400 APIError`, unchanged transport-wise from 001/003).

Base behaviour (request/response shape, when the hook runs, that it
aggregates every problem into one `Cannot publish: ...` message, that a
rejected save leaves the previously published version serving unchanged) is
**unchanged** from 001. This delta only changes *which* problems get
checked, based on the document's `pageType`.

## Behaviour

1. Resolve `pageType` from `data.pageType ?? originalDoc.pageType`
   (existing document being edited keeps its type unless this save changes
   it).
2. Always checked, regardless of type: domain assigned, path assigned,
   `builder.html` non-empty, `(domain, path)` unique among published pages.
3. If `pageType === "subscription"`: additionally require exactly one
   lead-form block, exactly one email form field, every form field has a
   name and label, and `successMessage`/`consentPurposeText`/
   `privacyNoticeUrl`/`privacyNoticeVersion` are all set. (Identical to
   every page's requirements before this feature.)
4. If `pageType === "free"`: additionally require **zero** lead-form
   blocks. No form-configuration requirements.
5. If `pageType === "confirmation"`: additionally require **zero**
   lead-form blocks, and require `builder.html` to contain the literal
   substring `{{unsubscribeUrl}}`. No form-configuration requirements.
6. Any failed check adds one sentence to the aggregated `Cannot publish:
   ...` message, same as today — a `free`/`confirmation` page with a
   lead-form block gets `"...must not contain a lead-form block (found
   1)."`-shaped wording (mirrors the existing `"...must contain exactly one
   lead-form block (found 0)."` phrasing for `subscription`); a
   `confirmation` page missing the placeholder gets `"...must include the
   unsubscribe-link placeholder."`.

## Example responses

`free` page, one lead-form block, otherwise valid:

```json
{ "errors": [{ "message": "Cannot publish: the page must not contain a lead-form block (found 1)." }] }
```

`confirmation` page, no lead-form block, no placeholder:

```json
{ "errors": [{ "message": "Cannot publish: the confirmation page must include the unsubscribe-link placeholder." }] }
```

`subscription` page — **identical to today**, no change:

```json
{ "errors": [{ "message": "Cannot publish: the page must contain exactly one lead-form block (found 0)." }] }
```
