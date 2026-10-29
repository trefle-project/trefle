import { describe, expect, it } from "vitest";

import { uploadEditsOnce } from "../src/hooks/upload-edits-once";

/**
 * 022-ux-improvement — regression: an upload sent with Payload's crop /
 * focal-point edits failed (500 « fetch failed ») because the storage
 * plugin's inner save re-applied them without the file.
 */
const run = (operation: string, context: Record<string, unknown>) => {
  const req = { context, query: { uploadEdits: { crop: { x: 1 } }, depth: "0" } };
  uploadEditsOnce({ args: { req }, operation } as never);
  return req.query;
};

describe("uploadEditsOnce", () => {
  it("drops the edits for the storage plugin's inner save only", () => {
    expect(run("update", { skipCloudStorage: true })).toEqual({ depth: "0" });
    expect(run("create", {})).toHaveProperty("uploadEdits");
    expect(run("update", {})).toHaveProperty("uploadEdits");
  });
});
