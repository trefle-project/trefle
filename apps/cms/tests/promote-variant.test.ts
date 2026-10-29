import { describe, expect, it, vi } from "vitest";

import { promoteVariantEndpoint } from "../src/endpoints/promoteVariant";

const admin = { id: "u1", role: "admin", isActive: true };

const experiment = { id: 1, status: "running", controlPage: { id: 180 } };
const winner = {
  id: 182,
  status: "published",
  experimentOf: { id: 180 },
  builder: { html: "<h1>winner</h1>", css: "", blockCount: { total: 1, byType: { hero: 1 }, leadForm: 0 } },
  form: { fields: [{ id: "abc", name: "email", label: "Email", type: "email" }] },
  seo: { metaTitle: "Winner" },
};

function makeReq(opts: {
  user?: unknown;
  body?: Record<string, unknown>;
  experiment?: unknown;
  winner?: unknown;
  update?: ReturnType<typeof vi.fn>;
}) {
  const findByID = vi.fn(async ({ collection }: { collection: string }) => {
    if (collection === "experiments") return opts.experiment === undefined ? experiment : opts.experiment;
    return opts.winner === undefined ? winner : opts.winner;
  });
  return {
    user: opts.user === undefined ? admin : opts.user,
    routeParams: { id: "1" },
    json: async () => opts.body ?? { winnerPageId: "182" },
    payload: {
      findByID,
      update: opts.update ?? vi.fn().mockResolvedValue({ id: 1, status: "concluded", winner: 182 }),
    },
  } as never;
}

describe("promoteVariantEndpoint (008-ab-testing, FR-010/FR-011)", () => {
  it("copies the winner's builder/form/seo onto the control via update, never a create", async () => {
    const update = vi.fn().mockResolvedValue({ id: 1, status: "concluded", winner: 182 });
    const req = makeReq({ update });
    const res = await promoteVariantEndpoint.handler!(req);
    expect(res.status).toBe(200);

    const pagesUpdateCall = update.mock.calls.find((c) => c[0].collection === "pages")!;
    expect(pagesUpdateCall[0].id).toBe(180); // the control's own id — never changes
    expect(pagesUpdateCall[0].data.builder).toEqual(winner.builder);
    expect(pagesUpdateCall[0].data.seo).toEqual(winner.seo);
    expect(pagesUpdateCall[0].data).not.toHaveProperty("domain");
    expect(pagesUpdateCall[0].data).not.toHaveProperty("path");

    const expUpdateCall = update.mock.calls.find((c) => c[0].collection === "experiments")!;
    expect(expUpdateCall[0].data).toMatchObject({ status: "concluded", winner: 182 });
  });

  it("strips array-row ids from the copied form (same fix as createTestVariant)", async () => {
    const update = vi.fn().mockResolvedValue({ id: 1 });
    const req = makeReq({ update });
    await promoteVariantEndpoint.handler!(req);
    const pagesUpdateCall = update.mock.calls.find((c) => c[0].collection === "pages")!;
    expect(pagesUpdateCall[0].data.form.fields[0]).not.toHaveProperty("id");
  });

  it("rejects promoting on a non-running experiment", async () => {
    const req = makeReq({ experiment: { ...experiment, status: "concluded" } });
    await expect(promoteVariantEndpoint.handler!(req)).rejects.toThrow(/Only a running test/);
  });

  it("rejects a winner that isn't a variant of this control", async () => {
    const req = makeReq({ winner: { ...winner, experimentOf: { id: 999 } } });
    await expect(promoteVariantEndpoint.handler!(req)).rejects.toThrow(/not a variant of this test/);
  });

  it("rejects an unpublished winner", async () => {
    const req = makeReq({ winner: { ...winner, status: "draft" } });
    await expect(promoteVariantEndpoint.handler!(req)).rejects.toThrow(/Only a published variant/);
  });

  it("400s when winnerPageId is missing", async () => {
    const req = makeReq({ body: {} });
    const res = await promoteVariantEndpoint.handler!(req);
    expect(res.status).toBe(400);
  });

  it("404s when the experiment doesn't exist", async () => {
    const req = makeReq({ experiment: null });
    const res = await promoteVariantEndpoint.handler!(req);
    expect(res.status).toBe(404);
  });

  it("rejects a non-staff caller with 403", async () => {
    const req = makeReq({ user: null });
    const res = await promoteVariantEndpoint.handler!(req);
    expect(res.status).toBe(403);
  });
});
