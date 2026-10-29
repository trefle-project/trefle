import type { Payload } from "payload";

import { adminText } from "../i18n";

/**
 * 015-penpot-site-import (T028, contracts/site-import-api.md « Admin UI
 * entry ») — « Importer un site Penpot », above the Pages list and in a
 * domain's document controls. Rendered only when PENPOT_IMPORT is on and for
 * admins and editors. On a domain it is shown once the domain is saved and
 * active, and opens the wizard with that domain already chosen.
 */
const WIZARD = "/admin/collections/pages/import-penpot";

type Props = { payload: Payload; user?: { role?: string } | null; id?: number | string; forDomain?: boolean; i18n?: { language?: string } };

export default async function SiteImportButton({ payload, user, id, forDomain, i18n }: Props) {
  if (process.env.PENPOT_IMPORT !== "on") return null;
  if (user?.role !== "admin" && user?.role !== "editor") return null;

  let href = WIZARD;
  if (forDomain) {
    if (id == null) return null;
    const domain = await payload
      .findByID({ collection: "domains", id, depth: 0, overrideAccess: true })
      .catch(() => null);
    if (!domain?.isActive) return null;
    href = `${WIZARD}?domain=${encodeURIComponent(String(domain.id))}`;
  }

  return (
    <div style={{ margin: "0 0 12px" }}>
      <a
        href={href}
        className="btn btn--style-secondary btn--size-small"
        style={{ padding: "4px 10px", border: "1px solid var(--theme-elevation-250)", borderRadius: 4, textDecoration: "none" }}
      >
        {adminText(i18n?.language)("imports.siteTitle")}
      </a>
    </div>
  );
}
