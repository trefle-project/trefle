import { describe, expect, it, vi } from "vitest";

import { leadsExportEndpoint } from "../src/endpoints/leadsExport";

type Handler = (req: unknown) => Promise<Response>;
const handler = leadsExportEndpoint.handler as unknown as Handler;

const lead = (over: Record<string, unknown> = {}) => ({
  id: 1,
  submittedAt: "2026-09-01T10:00:00.000Z",
  email: "a@b.com",
  fieldValues: { firstName: "A, B" },
  page: 7,
  domainHostname: "site-a.localhost",
  language: "en",
  metadata: { pageUrl: "u", utm: { source: "news" } },
  consentStatus: "consented",
  isDuplicate: false,
  ...over,
});

function makeReq(opts: {
  user?: unknown;
  query?: Record<string, string>;
  pages?: Record<string, unknown>[][];
  settings?: Record<string, unknown>;
}) {
  const pages = opts.pages ?? [[lead()]];
  let call = 0;
  const find = vi.fn().mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === "activity-log") return { docs: [], totalDocs: 0 };
    const docs = pages[call] ?? [];
    const hasNextPage = call < pages.length - 1;
    call += 1;
    return { docs, hasNextPage, totalDocs: pages.flat().length };
  });
  const create = vi.fn().mockResolvedValue({});
  const findGlobal = vi.fn().mockResolvedValue(opts.settings ?? { exportConsentedOnlyByDefault: true });
  return {
    payload: { find, create, findGlobal, logger: { warn: vi.fn() } },
    user: opts.user ?? { role: "editor", isActive: true, id: 9 },
    query: opts.query ?? {},
  };
}

async function readCsv(res: Response): Promise<string[]> {
  const text = await res.text();
  return text.trim().split("\r\n");
}

describe("leads-export endpoint (T053)", () => {
  it("403 for a non-staff caller", async () => {
    const res = await handler(makeReq({ user: { isService: true } }));
    expect(res.status).toBe(403);
  });

  it("streams a CSV with a header row and one row per lead", async () => {
    const req = makeReq({ pages: [[lead({ id: 1 }), lead({ id: 2 })]] });
    const res = await handler(req);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    const rows = await readCsv(res);
    expect(rows[0]).toContain("leadId,submittedAt,email");
    expect(rows).toHaveLength(3); // header + 2
    expect(rows[1]).toContain("news"); // utm_source flattened
    expect(rows[1]).toContain('"{""firstName"":""A, B""}"'); // fieldValues JSON, CSV-escaped
  });

  // 005-content-language-tagging, FR-010 — plain substring checks, not a
  // naive split(","): `fieldValues`'s JSON cell is itself CSV-quoted and
  // contains commas, which would throw off column-index-by-split.
  it("includes a language column in the header, right after domainHostname", async () => {
    const req = makeReq({ pages: [[lead({ id: 1, domainHostname: "site-a.localhost", language: "es" })]] });
    const res = await handler(req);
    const rows = await readCsv(res);
    expect(rows[0]).toContain("domainHostname,language,pageUrl");
    expect(rows[1]).toContain("site-a.localhost,es,");
  });

  // 006-double-optin-email, FR-013
  it("includes an optInConfirmedAt column, right after consentStatus", async () => {
    const req = makeReq({
      pages: [[lead({ id: 1, consentStatus: "consented", optInConfirmedAt: "2026-02-01T00:00:00.000Z" })]],
    });
    const res = await handler(req);
    const rows = await readCsv(res);
    expect(rows[0]).toContain("consentStatus,optInConfirmedAt,isDuplicate");
    // 022 US6: no zone chosen anywhere → Europe/Paris (winter: +01:00).
    expect(rows[1]).toContain("consented,2026-02-01T01:00:00+01:00,false");
  });

  // 022-ux-improvement (US6, FR-031)
  it("writes dates in the exporting member's display time zone, else the installation default", async () => {
    const mine = await readCsv(await handler(makeReq({ user: { role: "editor", isActive: true, id: 9, displayTimezone: "America/New_York" } })));
    expect(mine[1]).toContain(",2026-09-01T06:00:00-04:00,");
    const byDefault = await readCsv(await handler(makeReq({ settings: { exportConsentedOnlyByDefault: true, adminTimezone: "Asia/Tokyo" } })));
    expect(byDefault[1]).toContain(",2026-09-01T19:00:00+09:00,");
  });

  it("leaves optInConfirmedAt empty for an unconfirmed lead", async () => {
    const req = makeReq({ pages: [[lead({ id: 1, consentStatus: "consented", optInConfirmedAt: null })]] });
    const res = await handler(req);
    const rows = await readCsv(res);
    expect(rows[1]).toContain("consented,,false");
  });

  it("applies consentedOnly from settings by default and always excludes erased", async () => {
    const req = makeReq({});
    await handler(req);
    const findCall = req.payload.find.mock.calls.find((c) => c[0].collection === "leads")![0];
    const clauses = JSON.stringify(findCall.where);
    expect(clauses).toContain('"erasedAt":{"equals":null}');
    expect(clauses).toContain('"consentStatus":{"equals":"consented"}');
  });

  it("honours consentedOnly=0 to include withdrawn consent", async () => {
    const req = makeReq({ query: { consentedOnly: "0" } });
    await handler(req);
    const findCall = req.payload.find.mock.calls.find((c) => c[0].collection === "leads")![0];
    expect(JSON.stringify(findCall.where)).not.toContain('"consentStatus":{"equals":"consented"}');
  });

  it("pages through results and writes a leads-exported activity entry with the count", async () => {
    const req = makeReq({ pages: [[lead({ id: 1 })], [lead({ id: 2 })], [lead({ id: 3 })]] });
    const res = await handler(req);
    const rows = await readCsv(res);
    expect(rows).toHaveLength(4); // header + 3 across 3 pages
    const act = req.payload.create.mock.calls.find((c) => c[0].collection === "activity-log")![0];
    expect(act.data).toMatchObject({ type: "leads-exported", actor: 9, meta: { count: 3 } });
  });
});
