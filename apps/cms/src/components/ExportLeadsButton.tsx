import { adminText } from "../i18n";

/**
 * "Export CSV" action above the Leads list (T055). Server component, no client
 * JS — two plain links to `GET /api/leads-export`. The endpoint always excludes
 * erased leads; `consentedOnly` (or not) is chosen here.
 *
 * v1: exports the full set. Per-column list filters aren't threaded through yet
 * (the endpoint accepts `page` / `from` / `to` / `consentStatus` query params
 * for programmatic use).
 *
 * 023-admin-i18n — in the member's admin language.
 */
const ExportLeadsButton = ({ i18n }: { i18n?: { language?: string } }) => {
  const t = adminText(i18n?.language);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 12px" }}>
      <strong style={{ fontSize: 13 }}>{t("leads.exportLabel")}</strong>
      <a
        href="/api/leads-export?consentedOnly=1"
        className="btn btn--style-secondary btn--size-small"
        style={{
          padding: "4px 10px",
          border: "1px solid var(--theme-elevation-250)",
          borderRadius: 4,
          textDecoration: "none",
        }}
      >
        {t("leads.exportConsented")}
      </a>
      <a
        href="/api/leads-export?consentedOnly=0"
        className="btn btn--style-secondary btn--size-small"
        style={{
          padding: "4px 10px",
          border: "1px solid var(--theme-elevation-250)",
          borderRadius: 4,
          textDecoration: "none",
        }}
      >
        {t("leads.exportAll")}
      </a>
    </div>
  );
};

export default ExportLeadsButton;
