import { describe, expect, it, vi } from "vitest";

import { concludeTestWithoutPromotingEndpoint } from "../src/endpoints/concludeTestWithoutPromoting";

const admin = { id: "u1", role: "admin", isActive: true };
const experiment = { id: 1, status: "running", controlPage: { id: 180 } };

function makeReq(opts: { user?: unknown; experiment?: unknown; update?: ReturnType<typeof vi.fn> }) {
  return {
    user: opts.user === undefined ? admin : opts.user,
    routeParams: { id: "1" },
    payload: {
      findByID: vi.fn().mockResolvedValue(opts.experiment === undefined ? experiment : opts.experiment),
      update: opts.update ?? vi.fn().mockResolvedValue({ id: 1, status: "concluded" }),
    },
  } as never;
}

describe("concludeTestWithoutPromotingEndpoint (008-ab-testing, FR-010)", () => {
  it("concludes with no winner and never touches the control page", async () => {
    const update = vi.fn().mockResolvedValue({ id: 1, status: "concluded" });
    const req = makeReq({ update });
    const res = await concludeTestWithoutPromotingEndpoint.handler!(req);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1); // only the experiments doc — never "pages"
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "experiments", data: expect.objectContaining({ status: "concluded" }) }),
    );
    expect(update.mock.calls[0]![0].data).not.toHaveProperty("winner");
  });

  it("rejects concluding a non-running experiment", async () => {
    const req = makeReq({ experiment: { ...experiment, status: "concluded" } });
    await expect(concludeTestWithoutPromotingEndpoint.handler!(req)).rejects.toThrow(/Only a running test/);
  });

  it("404s when the experiment doesn't exist", async () => {
    const req = makeReq({ experiment: null });
    const res = await concludeTestWithoutPromotingEndpoint.handler!(req);
    expect(res.status).toBe(404);
  });

  it("rejects a non-staff caller with 403", async () => {
    const req = makeReq({ user: null });
    const res = await concludeTestWithoutPromotingEndpoint.handler!(req);
    expect(res.status).toBe(403);
  });
});
