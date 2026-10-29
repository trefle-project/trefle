# Contract delta: revalidation producer gains retry + louder failure

Base contract: `specs/001-landing-page-lead-capture/contracts/revalidation.md`
(`POST /api/revalidate`, owned by `apps/web`). The HTTP contract itself
(request/response shape, HMAC signature, 5-minute replay guard, cache-tag
scheme) is **unchanged** — this delta only changes how the producer
(`apps/cms`'s `revalidateTags()`) behaves when the call fails.

## Producer behaviour delta (`apps/cms/src/hooks/revalidate.ts`)

Today: one `fetch` attempt; any failure (network error or non-2xx) logs at
`warn` and is dropped — the calling Payload hook never learns of it (by
design — a save must never block on this call).

From this feature on:

1. On a network error or non-2xx response, retry up to **3 total attempts**
   with a short backoff between them (mirrors the bounded
   retry-with-deadline pattern already used by `apps/web`'s
   `postLeadIntake`; total wall-clock budget stays well under Payload's
   request-handling expectations — this is a background call, not on the
   save's critical path).
2. If every attempt fails, log at **`error`** (not `warn`), including the
   `reason`, `tags`, and (where the caller has it) the page/domain id.
3. Still fire-and-forget from the calling hook's (`pageRevalidate`,
   `Domains.ts`'s `afterChange`/`afterDelete`) perspective — `void
   revalidateTags(...)` — a save is never blocked or failed by this call,
   retries included.

## Why this is a contract-relevant delta, not just an internal change

`revalidation.md`'s "Producer rules" table is a promise about *when* tags are
emitted. This delta strengthens the promise from "an emission is attempted"
to "an emission is attempted up to 3 times before being given up on, and a
given-up emission is now operationally visible" — closing the gap that let a
transient failure look, from the outside, like the producer rule wasn't
followed at all (User Story 2's "editing doesn't republish" report).
