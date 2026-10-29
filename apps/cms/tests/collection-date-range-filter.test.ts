import { describe, expect, it } from "vitest";
import type { Where } from "payload";

import { mergeDateRangeIntoWhere } from "../src/lib/mergeDateRangeWhere";

const range = { gte: "2026-09-17T00:00:00.000Z", lt: "2026-09-21T00:00:00.000Z" };
const dateFields = ["updatedAt", "publishedAt", "createdAt"];

/**
 * 010-date-range-filters — `mergeDateRangeIntoWhere` is the one piece of
 * real logic in `CollectionDateRangeFilter.client.tsx` (a presentational
 * component otherwise, exempt from unit coverage per the constitution).
 * research.md §3. `pages` offers several selectable date fields — the
 * `candidateFieldNames` param is every field the filter offers, so it can
 * recognize and replace its own condition regardless of which of them was
 * previously active (e.g. after the operator switches from "updatedAt" to
 * "publishedAt").
 */
describe("mergeDateRangeIntoWhere", () => {
  it("returns just the date condition when the current where is empty", () => {
    expect(mergeDateRangeIntoWhere(undefined, dateFields, "updatedAt", range)).toEqual({
      updatedAt: { greater_than_equal: range.gte, less_than: range.lt },
    });
    expect(mergeDateRangeIntoWhere({}, dateFields, "updatedAt", range)).toEqual({
      updatedAt: { greater_than_equal: range.gte, less_than: range.lt },
    });
  });

  it("wraps a WhereBuilder-shaped where as a sibling AND-branch, unaltered", () => {
    const whereBuilderWhere: Where = { or: [{ and: [{ status: { equals: "published" } }] }] };
    const merged = mergeDateRangeIntoWhere(whereBuilderWhere, dateFields, "updatedAt", range);
    expect(merged).toEqual({
      and: [whereBuilderWhere, { updatedAt: { greater_than_equal: range.gte, less_than: range.lt } }],
    });
  });

  it("clearing restores the original where unwrapped, not re-wrapped", () => {
    const whereBuilderWhere: Where = { or: [{ and: [{ status: { equals: "published" } }] }] };
    const merged = mergeDateRangeIntoWhere(whereBuilderWhere, dateFields, "updatedAt", range) as Where;
    const cleared = mergeDateRangeIntoWhere(merged, dateFields, "updatedAt", null);
    expect(cleared).toEqual(whereBuilderWhere);
  });

  it("clearing an already-empty where returns undefined, not {}", () => {
    expect(mergeDateRangeIntoWhere(undefined, dateFields, "updatedAt", null)).toBeUndefined();
    expect(mergeDateRangeIntoWhere({}, dateFields, "updatedAt", null)).toBeUndefined();
  });

  it("re-applying with no other filter active replaces the previous range, not ANDs it (regression: found live, second 'Appliquer' left the list unchanged/over-filtered)", () => {
    const firstApply = mergeDateRangeIntoWhere(undefined, dateFields, "updatedAt", range) as Where;
    expect(firstApply).toEqual({ updatedAt: { greater_than_equal: range.gte, less_than: range.lt } });
    const secondRange = { gte: "2026-10-01T00:00:00.000Z", lt: "2026-10-05T00:00:00.000Z" };
    const reApplied = mergeDateRangeIntoWhere(firstApply, dateFields, "updatedAt", secondRange);
    expect(reApplied).toEqual({
      updatedAt: { greater_than_equal: secondRange.gte, less_than: secondRange.lt },
    });
  });

  it("switching the selected field replaces the previous field's bare condition, not ANDs it", () => {
    const firstApply = mergeDateRangeIntoWhere(undefined, dateFields, "updatedAt", range) as Where;
    expect(firstApply).toEqual({ updatedAt: { greater_than_equal: range.gte, less_than: range.lt } });
    const switched = mergeDateRangeIntoWhere(firstApply, dateFields, "publishedAt", range);
    expect(switched).toEqual({ publishedAt: { greater_than_equal: range.gte, less_than: range.lt } });
  });

  it("switching the selected field replaces the previous field's AND-wrapped condition, preserving the other filter", () => {
    const other: Where = { status: { equals: "published" } };
    const firstApply = mergeDateRangeIntoWhere(other, dateFields, "updatedAt", range) as Where;
    expect(firstApply).toEqual({
      and: [other, { updatedAt: { greater_than_equal: range.gte, less_than: range.lt } }],
    });
    const switched = mergeDateRangeIntoWhere(firstApply, dateFields, "createdAt", range);
    expect(switched).toEqual({
      and: [other, { createdAt: { greater_than_equal: range.gte, less_than: range.lt } }],
    });
  });

  it("a second apply/clear cycle never nests its own wrapper", () => {
    const other: Where = { status: { equals: "published" } };
    const firstApply = mergeDateRangeIntoWhere(other, dateFields, "updatedAt", range) as Where;
    const secondRange = { gte: "2026-10-01T00:00:00.000Z", lt: "2026-10-05T00:00:00.000Z" };
    const reApplied = mergeDateRangeIntoWhere(firstApply, dateFields, "updatedAt", secondRange);
    expect(reApplied).toEqual({
      and: [other, { updatedAt: { greater_than_equal: secondRange.gte, less_than: secondRange.lt } }],
    });
  });

  it("preserves a condition on a field outside the candidate set untouched", () => {
    const other: Where = { status: { equals: "published" } };
    const merged = mergeDateRangeIntoWhere(other, dateFields, "updatedAt", range);
    expect(merged).toEqual({
      and: [other, { updatedAt: { greater_than_equal: range.gte, less_than: range.lt } }],
    });
  });
});
