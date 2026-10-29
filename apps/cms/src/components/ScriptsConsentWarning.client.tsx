"use client";

import { useFormFields } from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * 014-custom-code-editing, FR-008b — inside the page's « Scripts » section:
 * warns the admin when a snippet set to « Nécessite le consentement cookies »
 * can never run, because the page's domain doesn't show the cookie banner
 * (visitors have no way to accept). Reads live form state, like
 * PageLiveUrl.client.tsx, so it reacts to a domain or consent change before
 * saving. Loading or a failed lookup shows nothing — it's advice, not a gate.
 */
const hasConsentCode = (code: unknown, consent: unknown) =>
  typeof code === "string" && code.trim() !== "" && consent !== "essential";

const ScriptsConsentWarning = () => {
  const { t } = useAdminText();
  const domainField = useFormFields(([fields]) => fields?.domain);
  const needsConsent = useFormFields(
    ([fields]) =>
      hasConsentCode(fields?.["customCode.head.code"]?.value, fields?.["customCode.head.consent"]?.value) ||
      hasConsentCode(fields?.["customCode.bodyEnd.code"]?.value, fields?.["customCode.bodyEnd.consent"]?.value),
  );

  const domainValue = domainField?.value as unknown;
  const domainId = typeof domainValue === "object" && domainValue !== null ? (domainValue as { id?: unknown }).id : domainValue;
  const [bannerEnabled, setBannerEnabled] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setBannerEnabled(null);
    if (domainId == null || domainId === "") return;
    let ignore = false;
    fetch(`/api/domains/${domainId}?depth=0`, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { consentBannerEnabled?: boolean } | null) => {
        if (!ignore && d) setBannerEnabled(Boolean(d.consentBannerEnabled));
      })
      .catch(() => {
        /* no warning rather than a wrong one */
      });
    return () => {
      ignore = true;
    };
  }, [domainId]);

  if (!needsConsent || bannerEnabled !== false) return null;
  return (
    <div
      role="alert"
      style={{
        margin: "0 0 16px",
        padding: "12px 16px",
        borderLeft: "4px solid var(--theme-warning-500, #d97706)",
        borderRadius: 4,
        background: "var(--theme-elevation-50)",
      }}
    >
      {t("pages.scriptsNoBanner")}
    </div>
  );
};

export default ScriptsConsentWarning;
