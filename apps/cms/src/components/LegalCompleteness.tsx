import type { DefaultServerCellComponentProps, Payload } from "payload";

import { adminText } from "../i18n";
import { legalCompleteness, operatorMissing } from "../lib/legal/completeness";

/**
 * 021-legal-pages (US4, contracts/admin.md) — whether a domain's legal pages
 * are complete: a banner on the domain's edit view, a one-line cell in the
 * domains list, and the operator's part at the top of Settings. Saved data
 * only; pages are served anyway (missing lines are left out).
 */
type DomainDoc = { owner?: Record<string, string | null> | null; ownPrivacyPolicyUrl?: string | null; ownLegalNoticeUrl?: string | null };

const settingsOf = (payload: Payload) => payload.findGlobal({ slug: "settings", depth: 1, overrideAccess: true }) as unknown as Promise<Parameters<typeof operatorMissing>[0]>;

const box = (ok: boolean) =>
  ({
    margin: "0 0 16px",
    padding: "10px 14px",
    borderRadius: 4,
    border: `1px solid ${ok ? "var(--theme-success-500, #2e7d32)" : "var(--theme-warning-500, #b26a00)"}`,
  }) as const;

type I18n = { language?: string } | undefined;

function Status({ missing, lang }: { missing: string[]; lang?: string }) {
  const t = adminText(lang);
  return (
    <div role="status" style={box(missing.length === 0)}>
      {missing.length === 0 ? (
        <strong>{t("legal.complete")}</strong>
      ) : (
        <>
          <strong>{t("legal.incomplete")}</strong>
          {t("legal.toComplete", { list: missing.join(", ") })}
        </>
      )}
    </div>
  );
}

/** Domain edit view (ui field). */
export async function DomainLegalStatus({ data, payload, i18n }: { data?: DomainDoc; payload: Payload; i18n?: I18n }) {
  const lang = i18n?.language;
  if (data?.ownPrivacyPolicyUrl && data?.ownLegalNoticeUrl) return <Status missing={[]} lang={lang} />;
  return <Status missing={legalCompleteness(await settingsOf(payload), data ?? null, lang)} lang={lang} />;
}

/** Domains list column. */
export async function DomainLegalStatusCell({ rowData, payload, i18n }: DefaultServerCellComponentProps) {
  const t = adminText(i18n?.language);
  const domain = rowData as DomainDoc;
  const missing = domain?.ownPrivacyPolicyUrl && domain?.ownLegalNoticeUrl ? [] : legalCompleteness(await settingsOf(payload), domain);
  return <span>{missing.length === 0 ? t("legal.cellComplete") : t("legal.cellToComplete", { n: missing.length })}</span>;
}

/** Settings (ui field): the operator's part. */
export async function OperatorLegalStatus({ payload, i18n }: { payload: Payload; i18n?: I18n }) {
  return <Status missing={operatorMissing(await settingsOf(payload), i18n?.language)} lang={i18n?.language} />;
}
