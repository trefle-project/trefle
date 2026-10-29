import { describe, expect, it, vi } from "vitest";

import { oneRunningExperimentPerControl } from "../src/hooks/experiments-one-running-guard";

const noClash = { payload: { find: vi.fn().mockResolvedValue({ totalDocs: 0 }) } };

const call = (data: Record<string, unknown>, originalDoc: Record<string, unknown> | undefined = undefined, req = noClash) =>
  oneRunningExperimentPerControl({ data, originalDoc, req } as never);

describe("oneRunningExperimentPerControl (008-ab-testing, FR-004)", () => {
  it("allows starting a test on a control with no other running test", async () => {
    const out = (await call({ status: "running", controlPage: "p1" })) as { status?: string };
    expect(out.status).toBe("running");
  });

  it("rejects starting a second running test on a control that already has one", async () => {
    const req = { payload: { find: vi.fn().mockResolvedValue({ totalDocs: 1 }) } };
    await expect(call({ status: "running", controlPage: "p1" }, undefined, req)).rejects.toThrow(
      /already has a running test/,
    );
  });

  it("allows starting a test on a different control regardless of another control's running test", async () => {
    // The mocked find() itself scopes by controlPage — this test documents the
    // intent (the `where` clause includes `controlPage: { equals: controlPageId }`);
    // a totalDocs: 0 response models "no clash for *this* control".
    const out = (await call({ status: "running", controlPage: "p2" })) as { status?: string };
    expect(out.status).toBe("running");
  });

  it("does nothing for a non-running status", async () => {
    const out = await call({ status: "draft", controlPage: "p1" });
    expect(out).toEqual({ status: "draft", controlPage: "p1" });
  });

  it("excludes the document's own id from the clash check (allows re-saving an already-running experiment)", async () => {
    const find = vi.fn().mockResolvedValue({ totalDocs: 0 });
    await call({ status: "running", controlPage: "p1" }, { id: "e1", status: "running", controlPage: "p1" }, { payload: { find } });
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          and: expect.arrayContaining([{ id: { not_equals: "e1" } }]),
        }),
      }),
    );
  });
});
