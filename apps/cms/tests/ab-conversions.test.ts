import { beforeEach, describe, expect, it, vi } from "vitest";

import { leadIntakeEndpoint } from "../src/endpoints/leadIntake";

/**
 * 018-ab-significance (contracts/exposure-intake.md « Lead attribution »,
 * T010) — a lead sent with a measured visitor id from a page under test is
 * attributed to that page; anything else stores the lead only.
 */
process.env.UNSUBSCRIBE_SECRET = "test-unsub";
process.env.CONFIRM_TOKEN_SECRET = "test-confirm";

type Handler = (req: unknown) => Promise<Response>;
const handler = leadIntakeEndpoint.handler as unknown as Handler;
const VISITOR = "AbC-_09xYz1";

const variantPage = {
  id: 57,
  status: "published",
  experimentOf: { id: 12 },
  domain: { id: 3, hostname: "site-a.localhost" },
  language: { id: 2, code: "fr" },
  form: { fields: [{ name: "email", type: "email", required: true }] },
};

function makeReq({ visitorId, page = variantPage, running = true, failAttribution = false }: {
  visitorId?: string;
  page?: object;
  running?: boolean;
  failAttribution?: boolean;
}) {
  const payload = {
    findByID: vi.fn().mockResolvedValue(page),
    find: vi.fn().mockImplementation(async ({ collection }: { collection: string }) =>
      collection === "experiments" && running
        ? { docs: [{ growthbookExperimentKey: "page-12-1760" }], totalDocs: 1 }
        : { docs: [], totalDocs: 0 },
    ),
    create: vi.fn().mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === "leads") return { id: 101 };
      if (collection === "consent-records") return { id: 202 };
      if (failAttribution) throw new Error("db down");
      return { id: 303 };
    }),
    update: vi.fn().mockResolvedValue({}),
    sendEmail: vi.fn().mockResolvedValue({}),
  };
  return {
    payload,
    user: { isService: true },
    headers: new Headers({ host: "site-a.localhost" }),
    json: async () => ({ pageId: 57, email: "jane@example.com", consent: true, ...(visitorId ? { visitorId } : {}) }),
  };
}

const attributionCalls = (req: ReturnType<typeof makeReq>) =>
  req.payload.create.mock.calls.filter(([arg]) => (arg as { collection: string }).collection === "ab-conversions");

describe("lead intake — A/B attribution (018)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("attributes a lead from a variant page to that page and the visitor", async () => {
    const req = makeReq({ visitorId: VISITOR });
    expect((await handler(req)).status).toBe(200);
    expect(req.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "experiments", where: { and: [{ controlPage: { equals: 12 } }, { status: { equals: "running" } }] } }),
    );
    expect(attributionCalls(req)).toEqual([
      [expect.objectContaining({ data: { lead: 101, visitorId: VISITOR, experimentKey: "page-12-1760", variant: 57, convertedAt: expect.any(String) } })],
    ]);
  });

  it("looks the test up by the page itself when it is the control", async () => {
    const req = makeReq({ visitorId: VISITOR, page: { ...variantPage, id: 12, experimentOf: null } });
    await handler(req);
    expect(req.payload.find).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "experiments", where: { and: [{ controlPage: { equals: 12 } }, { status: { equals: "running" } }] } }),
    );
    expect(attributionCalls(req)[0]?.[0]).toMatchObject({ data: { variant: 12 } });
  });

  it("stores no attribution without a visitor id, with a malformed one, or off-test", async () => {
    for (const req of [makeReq({}), makeReq({ visitorId: "nope" }), makeReq({ visitorId: VISITOR, running: false })]) {
      expect((await handler(req)).status).toBe(200);
      expect(attributionCalls(req)).toEqual([]);
    }
  });

  it("a failed attribution never fails the lead", async () => {
    const req = makeReq({ visitorId: VISITOR, failAttribution: true });
    const res = await handler(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, leadId: 101 });
  });
});
