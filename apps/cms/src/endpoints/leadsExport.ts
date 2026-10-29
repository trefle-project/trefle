import type { Endpoint, Where } from "payload";

import { csvRow } from "../lib/csv";
import { writeActivity } from "../lib/activity";
import { effectiveZone, isoInZone, zoneDay } from "../lib/admin-time";
import { isAdminOrEditor } from "../access";

/**
 * GET /api/leads-export (T053, FR-023/024, SC-008) — streamed CSV of the
 * currently filtered leads. Admin + Editor only. Always excludes erased leads;
 * `consentedOnly` (default from settings) drops withdrawn consent.
 *
 * Query: page, from, to (ISO), consentStatus, consentedOnly=1|0
 *
 * 022-ux-improvement (US6) — dates are written in the exporting member's
 * display time zone, with their offset (« 2026-10-23T14:05:00+02:00 »).
 */
const HEADERS = [
  "leadId",
  "submittedAt",
  "email",
  "fieldValues",
  "pageId",
  "domainHostname",
  "language",
  "pageUrl",
  "referrer",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "userAgent",
  "consentStatus",
  "optInConfirmedAt",
  "isDuplicate",
];

export const leadsExportEndpoint: Endpoint = {
  path: "/leads-export",
  method: "get",
  handler: async (req) => {
    if (!isAdminOrEditor({ req } as never)) return new Response("Forbidden", { status: 403 });

    const q = req.query as Record<string, string | undefined>;
    const settings = (await req.payload.findGlobal({ slug: "settings", overrideAccess: true })) as {
      exportConsentedOnlyByDefault?: boolean;
      adminTimezone?: string | null;
    };
    const tz = effectiveZone(req.user as { displayTimezone?: string | null } | null, settings);
    const inZone = (value: unknown) => (value ? isoInZone(value as string, tz) : value);
    const consentedOnly =
      q.consentedOnly != null ? q.consentedOnly === "1" || q.consentedOnly === "true" : settings.exportConsentedOnlyByDefault !== false;

    const and: Where[] = [{ erasedAt: { equals: null } }];
    if (q.page) and.push({ page: { equals: Number(q.page) } });
    if (q.consentStatus) and.push({ consentStatus: { equals: q.consentStatus } });
    if (consentedOnly) and.push({ consentStatus: { equals: "consented" } });
    if (q.from) and.push({ submittedAt: { greater_than_equal: q.from } });
    if (q.to) and.push({ submittedAt: { less_than_equal: q.to } });
    const where: Where = { and };

    const pageSize = 500;
    const encoder = new TextEncoder();
    const payload = req.payload;
    let exported = 0;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(csvRow(HEADERS)));
        let page = 1;
        for (;;) {
          const res = await payload.find({
            collection: "leads",
            where,
            depth: 0,
            limit: pageSize,
            page,
            sort: "-submittedAt",
            overrideAccess: true,
          });
          for (const d of res.docs as unknown as Record<string, unknown>[]) {
            const m = (d.metadata ?? {}) as Record<string, unknown>;
            const utm = (m.utm ?? {}) as Record<string, unknown>;
            controller.enqueue(
              encoder.encode(
                csvRow([
                  d.id,
                  inZone(d.submittedAt),
                  d.email,
                  d.fieldValues,
                  d.page,
                  d.domainHostname,
                  d.language,
                  m.pageUrl,
                  m.referrer,
                  utm.source,
                  utm.medium,
                  utm.campaign,
                  utm.term,
                  utm.content,
                  m.userAgent,
                  d.consentStatus,
                  inZone(d.optInConfirmedAt),
                  d.isDuplicate ? "true" : "false",
                ]),
              ),
            );
            exported += 1;
          }
          if (!res.hasNextPage) break;
          page += 1;
        }
        controller.close();
        void writeActivity(payload, {
          type: "leads-exported",
          actor: req.user?.id ?? null,
          targetType: "lead-batch",
          targetId: `${exported} leads`,
          meta: { count: exported, consentedOnly, filters: { page: q.page, from: q.from, to: q.to, consentStatus: q.consentStatus } },
          req,
        });
      },
    });

    const stamp = zoneDay(new Date(), tz);
    return new Response(stream, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="trefle-leads-${stamp}.csv"`,
        "cache-control": "no-store",
      },
    });
  },
};
