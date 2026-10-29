import type { Where } from "payload";

/**
 * 010-date-range-filters — combines a picked date range into whatever
 * `where` Payload's own WhereBuilder ("Filters") already set, for
 * `CollectionDateRangeFilter.client.tsx`. Pure and dependency-free on
 * purpose: `useListQuery`'s `handleWhereChange` replaces `where` wholesale
 * (research.md §2), so the caller must read the current `where` itself and
 * pass back the full merged object — this is that merge. Kept in its own
 * file, not co-located with the `.client.tsx` component that calls it,
 * because that file pulls in `@payloadcms/ui`/`react-day-picker` (and their
 * own CSS imports), which this project's Vitest config (Node environment,
 * no CSS loader) cannot import — found live when the first version of this
 * test tried to import it from the component file directly.
 *
 * `candidateFieldNames` is every date field the filter offers on this
 * collection (e.g. `updatedAt`/`publishedAt`/`createdAt` on `pages`) — any
 * one of them may be the field a *previous* apply put in `where`, so
 * switching which field the operator filters by must still recognize and
 * replace that old condition rather than AND a stale condition on a
 * different field together with the new one.
 */
const isOwnCondition = (where: Where | undefined, candidateFieldNames: string[]): boolean =>
  !!where && Object.keys(where).length === 1 && candidateFieldNames.includes(Object.keys(where)[0]!);

export function mergeDateRangeIntoWhere(
  currentWhere: Where | undefined,
  candidateFieldNames: string[],
  fieldName: string,
  range: { gte: string; lt: string } | null,
): Where | undefined {
  let base = currentWhere;
  // Unwrap whatever this function produced on a previous call, so
  // re-picking, clearing, or switching which field is filtered doesn't
  // nest/duplicate/stack conditions. Two shapes to recognize: our own bare
  // condition (`{ [someCandidateField]: {...} }`, produced when
  // `currentWhere` was empty at the time of the previous apply — found
  // live: without this branch, a second "Appliquer" with no other filter
  // active ANDed the old date range together with the new one instead of
  // replacing it, since only the `{ and: [...] }` shape below was checked),
  // and our own AND-wrapper around a genuinely different pre-existing filter.
  if (isOwnCondition(base, candidateFieldNames)) {
    base = undefined;
  } else if (base?.and && Array.isArray(base.and) && base.and.length === 2) {
    const maybeOwn = base.and[1] as Where | undefined;
    if (isOwnCondition(maybeOwn, candidateFieldNames)) {
      base = base.and[0] as Where;
    }
  }
  const baseIsEmpty = !base || Object.keys(base).length === 0;
  if (!range) return baseIsEmpty ? undefined : base;
  const condition: Where = { [fieldName]: { greater_than_equal: range.gte, less_than: range.lt } };
  return baseIsEmpty ? condition : { and: [base as Where, condition] };
}
