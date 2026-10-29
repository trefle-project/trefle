"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * Sidebar "Lien public" under `publishedAt` on the Pages edit view: the
 * clickable public URL of the page on the renderer, so an editor can open the
 * live page in one click.
 *
 * Reads `savedDocumentData` from Payload's DocumentInfo context — the
 * **saved** document, updated by Payload's own `onSave` handler (`setData
 * (document)`), never by unsaved keystrokes. That's still the right
 * semantics (the link points at what is actually published), but it can no
 * longer be a server component reading the `data` prop like the original
 * version: after a save, Payload's edit view re-fetches form state with
 * `renderAllFields: false` — a deliberate optimisation that skips re-
 * rendering custom field *server* components (to avoid a server round trip
 * on every save), so a server-rendered version of this link kept showing
 * the path/domain from when the page was first opened, stale until a full
 * reload. `savedDocumentData` is the one piece Payload's client-side save
 * flow does update in place, so reading it from a client component fixes
 * that without needing a reload.
 *
 * `scheme`/`port` still come from the server wrapper (`PublishedUrl.tsx`) —
 * same reasoning as `PageLiveUrl.client.tsx`: a client component can't read
 * `PUBLIC_SITE_PROTOCOL`/`PUBLIC_SITE_PORT` itself without baking them into
 * the bundle at build time.
 */
const wrap: React.CSSProperties = { margin: "-8px 0 16px" };
const label: React.CSSProperties = {
  display: "block",
  marginBottom: 4,
  color: "var(--theme-elevation-600)",
  fontSize: 13,
};
const hint: React.CSSProperties = { margin: 0, fontSize: 13, color: "var(--theme-elevation-500)" };

const PublishedUrl = ({ scheme, port }: { scheme: string; port: string }) => {
  const { t } = useAdminText();
  const { savedDocumentData } = useDocumentInfo();
  const data = savedDocumentData as
    | { status?: string; path?: string; domain?: number | string | { hostname?: string } | null }
    | undefined;

  const status = data?.status;
  const path = typeof data?.path === "string" ? data.path.trim() : "";
  const domainRef = data?.domain;

  const [hostname, setHostname] = React.useState<string | null>(null);

  React.useEffect(() => {
    setHostname(null);
    if (typeof domainRef === "object" && domainRef !== null) {
      setHostname(domainRef.hostname ?? null);
      return;
    }
    if (domainRef == null || domainRef === "") return;

    let ignore = false;
    fetch(`/api/domains/${domainRef}?depth=0`, { credentials: "same-origin" })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then((doc: { hostname?: string }) => {
        if (!ignore) setHostname(doc.hostname ?? null);
      })
      .catch(() => {
        if (!ignore) setHostname(null);
      });
    return () => {
      ignore = true;
    };
  }, [domainRef]);

  if (status !== "published" || !domainRef || !path) {
    return (
      <div style={wrap}>
        <span style={label}>{t("pages.publicLink")}</span>
        <p style={hint}>{t("pages.publicLinkLater")}</p>
      </div>
    );
  }

  if (!hostname) return null;

  const url = `${scheme}://${hostname}${port ? `:${port}` : ""}${path}`;

  return (
    <div style={wrap}>
      <span style={label}>{t("pages.publicLink")}</span>
      <a href={url} target="_blank" rel="noreferrer" style={{ fontSize: 13, wordBreak: "break-all" }}>
        {url}
      </a>
    </div>
  );
};

export default PublishedUrl;
