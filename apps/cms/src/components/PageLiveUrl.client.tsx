"use client";

import { useFormFields } from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * Shows the page's actual resolved URL (the domain's real hostname + this
 * page's path) just above `RevalidationStatus`, live as the editor picks a
 * domain/path — not just after a save. Prompted by a real incident: an
 * editor manually built a `/confirmation?domain=…&path=…` test URL, typed
 * the wrong domain id, and read the resulting fallback page as a caching
 * bug. Nothing in the admin showed the actual hostname behind a `domain`
 * relationship value, so there was no way to catch the mistake without
 * cross-checking the Domains collection by hand.
 *
 * Rendered via `admin.components.edit.beforeDocumentControls` on Pages.ts —
 * the same slot as `RevalidationStatus`, on both the create and edit views.
 * Deliberately reads live form state (not just the saved document): the
 * point is to catch a wrong domain/path *before* saving, not just report
 * one after the fact.
 *
 * `scheme`/`port` come from the server wrapper (`PageLiveUrl.tsx`), not
 * hardcoded here — same values `PublishedUrl.tsx`'s "Lien public" link
 * already uses (`PUBLIC_SITE_PROTOCOL`/`PUBLIC_SITE_PORT`), so the URL this
 * shows while editing is the same one that actually works: `http://…:3001`
 * in local dev, `https://` with no port in prod. A client component can't
 * read those env vars itself without baking them into the bundle at build
 * time (`NEXT_PUBLIC_*`), which would defeat running the same built image
 * in both environments.
 */
const PageLiveUrl = ({ scheme, port }: { scheme: string; port: string }) => {
  const { t } = useAdminText();
  const domainField = useFormFields(([fields]) => fields?.domain);
  const pathField = useFormFields(([fields]) => fields?.path);
  const statusField = useFormFields(([fields]) => fields?.status);

  const domainValue = domainField?.value as unknown;
  const domainId = typeof domainValue === "object" && domainValue !== null ? (domainValue as { id?: unknown }).id : domainValue;
  const path = typeof pathField?.value === "string" ? pathField.value : "";
  const status = statusField?.value;

  const [hostname, setHostname] = React.useState<string | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    setHostname(null);
    setFailed(false);
    if (domainId == null || domainId === "") return;

    let ignore = false;
    fetch(`/api/domains/${domainId}?depth=0`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((doc: { hostname?: string }) => {
        if (!ignore) setHostname(doc.hostname ?? null);
      })
      .catch(() => {
        if (!ignore) setFailed(true);
      });
    return () => {
      ignore = true;
    };
  }, [domainId]);

  if (domainId == null || domainId === "") return null;

  const boxStyle: React.CSSProperties = {
    fontSize: 13,
    opacity: 0.8,
    margin: "0 0 12px",
    padding: "8px 12px",
    border: "1px solid var(--theme-elevation-150)",
    borderRadius: 4,
  };

  if (failed) {
    return <p style={boxStyle}>{t("pages.domainUnresolved", { id: String(domainId) })}</p>;
  }
  if (!hostname) {
    return <p style={boxStyle}>{t("pages.resolvingDomain")}</p>;
  }

  const url = `${scheme}://${hostname}${port ? `:${port}` : ""}${path || "/"}`;
  return (
    <p style={boxStyle}>
      {status === "published" ? t("pages.liveAt") : t("pages.willBeLiveAt")}
      <a href={url} target="_blank" rel="noopener noreferrer">
        {url}
      </a>
    </p>
  );
};

export default PageLiveUrl;
