import type { Payload } from "payload";

import { adminLanguageOf, adminText } from "../i18n";
import { ExperimentStats, type ExperimentArm } from "./ExperimentStats";
import PromoteActions from "./PromoteActions.client";
import VariantActions from "./VariantActions.client";

/**
 * 008-ab-testing, US2 — the control page's "Tests A/B" document tab
 * (`Pages.ts`'s `admin.components.views.edit`, `DocumentTabConfig`).
 * Server component: Payload hands a custom edit-view component `doc` (the
 * current, already-resolved document) and a live `payload` instance
 * directly — no REST round-trip needed, and no separate lookup for the
 * control page itself, since `doc` already *is* it.
 *
 * Deviation found only by inspecting the actual props live (printed via a
 * temporary debug log, then removed): `ServerProps`'s `id` field, per the
 * installed Payload 3.88 types, is not populated for this slot — `doc` is
 * the real, reliable source, confirmed against the live prop keys
 * (`doc`, `payload`, `params`, ... — no top-level `id`).
 *
 * Lists the control's variants (queried by `experimentOf`, per
 * data-model.md — never a stored array, so this is always the live set)
 * and, when a test is currently running, mounts `ExperimentStats` scoped
 * to it plus `PromoteActions` (US3) — promote a published variant, or
 * conclude without promoting; either way ends the test.
 *
 * `VariantActions` (US1) is the create-variant/start-test counterpart —
 * found live (reported by a user, page 11) that `createTestVariantEndpoint`
 * and `startTestEndpoint` had been fully built and exercised throughout
 * this whole feature's own manual verification, but only ever driven
 * directly over HTTP, never from an actual admin UI button; this tab's own
 * empty-state message even pointed at a "depuis l'onglet Édition" trigger
 * that was never built. Fixed by mounting the real buttons here instead.
 *
 * Each variant's title also links to its own `/admin/collections/pages/<id>`
 * edit view — found live (same user, immediately after the fix above): once
 * an operator could actually create a variant, there was no way to reach it
 * to edit its content, since it carries no `domain`/`path` of its own to
 * find it by and was previously only listed as plain text here.
 */
type ControlDoc = { id: number | string; title: string };
// `searchParams`, not `req`: a custom edit *view* gets Payload's `ServerProps`
// (`searchParams`, no `req`); only document *tabs* get `req`. Reading
// `req.searchParams` here crashed the whole tab (digest 624654279, found in
// production 2026-10-11).
type SearchParams = Record<string, string | string[] | undefined>;
type Props = { doc?: ControlDoc; payload: Payload; searchParams?: SearchParams; i18n?: { language?: string } };

const param = (sp: SearchParams | undefined, key: string): string | null => {
  const v = sp?.[key];
  return (Array.isArray(v) ? v[0] : v) || null;
};

type VariantDoc = { id: number | string; title: string; status: string };
type ExperimentDoc = {
  id: number | string;
  name: string;
  status: "draft" | "running" | "concluded";
  startedAt?: string | null;
  endedAt?: string | null;
  winner?: number | string | { id: number | string } | null;
  analysis?: unknown;
  analysisStartedAt?: string | null;
  analysisRefreshedAt?: string | null;
  analysisError?: string | null;
};

export default async function PageExperimentsTab({ doc, payload, searchParams, i18n }: Props) {
  const lang = adminLanguageOf(i18n?.language);
  const t = adminText(lang);
  if (!doc?.id) return <p>{t("ab.savePageFirst")}</p>;
  const controlId = doc.id;
  // 010-date-range-filters — an explicit period from ExperimentPeriodFilter
  // (research.md §6) overrides the default (unbounded since startedAt).
  const from = param(searchParams, "from");
  const to = param(searchParams, "to");

  const [variants, experiments] = await Promise.all([
    payload.find({
      collection: "pages",
      where: { experimentOf: { equals: controlId } },
      limit: 100,
      depth: 0,
      overrideAccess: true,
    }),
    payload.find({
      collection: "experiments",
      where: { controlPage: { equals: controlId } },
      sort: "-createdAt",
      limit: 20,
      depth: 0,
      overrideAccess: true,
    }),
  ]);

  const variantDocs = variants.docs as unknown as VariantDoc[];
  const experimentDocs = experiments.docs as unknown as ExperimentDoc[];
  const running = experimentDocs.find((e) => e.status === "running");

  return (
    <div style={{ padding: "16px" }}>
      <h2>{t("ab.abTests")}</h2>

      <h3>{t("ab.variants")}</h3>
      {variantDocs.length === 0 ? (
        <p>{t("ab.noVariant")}</p>
      ) : (
        <ul>
          {variantDocs.map((v) => (
            <li key={v.id}>
              <a href={`/admin/collections/pages/${v.id}`}>{v.title}</a> —{" "}
              {v.status === "published" ? t("ab.variantPublished") : t("ab.variantDraft")}
            </li>
          ))}
        </ul>
      )}
      <VariantActions
        controlPageId={controlId}
        controlTitle={doc.title}
        hasPublishedVariant={!running && variantDocs.some((v) => v.status === "published")}
      />

      <h3>{t("ab.runningTest")}</h3>
      {!running ? (
        <p>{t("ab.noRunningTest")}</p>
      ) : (
        <>
          <p>{running.name}</p>
          <ExperimentStats
            payload={payload}
            since={from ?? running.startedAt ?? null}
            until={to ?? null}
            startedAt={running.startedAt ?? null}
            endedAt={running.endedAt ?? null}
            experiment={running}
            lang={lang}
            arms={[
              { pageId: doc.id, label: `${doc.title} (original)` } as ExperimentArm,
              ...variantDocs.map((v): ExperimentArm => ({ pageId: v.id, label: v.title })),
            ]}
          />
          <PromoteActions
            experimentId={running.id}
            variants={variantDocs
              .filter((v) => v.status === "published")
              .map((v) => ({ id: v.id, label: v.title }))}
          />
        </>
      )}

      {experimentDocs.some((e) => e.status === "concluded") ? (
        <>
          <h3>{t("ab.history")}</h3>
          <ul>
            {experimentDocs
              .filter((e) => e.status === "concluded")
              .map((e) => {
                const winnerId =
                  typeof e.winner === "object" && e.winner ? e.winner.id : e.winner;
                return (
                  <li key={e.id}>
                    {e.name} — {winnerId ? t("ab.concludedPromoted") : t("ab.concludedNotPromoted")}
                  </li>
                );
              })}
          </ul>
        </>
      ) : null}
    </div>
  );
}
