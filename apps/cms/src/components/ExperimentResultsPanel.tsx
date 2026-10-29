import type { Payload, PayloadRequest } from "payload";

import { adminLanguageOf, adminText } from "../i18n";
import { ExperimentStats, type ExperimentArm } from "./ExperimentStats";

/**
 * 008-ab-testing, US4 (T042) — the same `ExperimentStats` table used by
 * `PageExperimentsTab.tsx`, mounted this time on the `experiments`
 * collection's own edit view (a `ui` field in `Experiments.ts`, the
 * lightest native slot for a read-only server-rendered panel — no new
 * admin infrastructure, per research.md §6). Opening any experiment
 * directly from its own admin section shows the same per-variant results
 * as opening it via the page's tab.
 *
 * A `ui` field's server component receives the document's own `data`
 * (Payload's `ServerComponentProps`) — unlike the custom-view `doc` prop
 * `PageExperimentsTab.tsx` relies on, this one is populated reliably, so
 * no separate live-prop-inspection step was needed here.
 */
type ExperimentData = {
  id?: number | string;
  status?: "draft" | "running" | "concluded";
  analysis?: unknown;
  analysisStartedAt?: string | null;
  analysisRefreshedAt?: string | null;
  analysisError?: string | null;
  controlPage?: number | string | { id: number | string } | null;
  startedAt?: string | null;
  endedAt?: string | null;
};

type VariantDoc = { id: number | string; title: string };

export default async function ExperimentResultsPanel({
  data,
  payload,
  req,
}: {
  data?: ExperimentData;
  payload: Payload;
  req: PayloadRequest;
}) {
  const lang = adminLanguageOf(req.i18n?.language);
  const t = adminText(lang);
  const controlRef = data?.controlPage;
  const controlId = typeof controlRef === "object" && controlRef ? controlRef.id : controlRef;
  if (!data?.id || !controlId) {
    return <p>{t("ab.saveTestFirst")}</p>;
  }

  const [control, variants] = await Promise.all([
    payload.findByID({ collection: "pages", id: controlId, depth: 0, overrideAccess: true }),
    payload.find({
      collection: "pages",
      where: { experimentOf: { equals: controlId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const variantDocs = variants.docs as unknown as VariantDoc[];
  // 010-date-range-filters — same override pattern as PageExperimentsTab.tsx.
  const from = req.searchParams.get("from");
  const to = req.searchParams.get("to");

  return (
    <div style={{ margin: "16px 0" }}>
      <h3>{t("ab.results")}</h3>
      <ExperimentStats
        payload={payload}
        since={from ?? data.startedAt ?? null}
        until={to ?? null}
        startedAt={data.startedAt ?? null}
        endedAt={data.endedAt ?? null}
        experiment={{ ...data, id: data.id }}
        lang={lang}
        arms={[
          { pageId: controlId, label: `${control.title} (original)` } as ExperimentArm,
          ...variantDocs.map((v): ExperimentArm => ({ pageId: v.id, label: v.title })),
        ]}
      />
    </div>
  );
}
