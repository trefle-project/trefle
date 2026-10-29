import type { DefaultServerCellComponentProps, Payload } from "payload";

import { adminText } from "../i18n";

/**
 * Fonts list column « Domaines »: the domains whose « Polices du domaine »
 * use this file. A file is shared by every domain using its family, so it may
 * list several, or none — then nothing serves it and it can be deleted.
 * Domains are readable by the same members as Fonts (staff).
 */
export async function domainsUsingFont(payload: Payload, fontId: number | string): Promise<string[]> {
  const found = await payload.find({
    collection: "domains",
    where: { "fonts.files": { in: [fontId] } },
    select: { hostname: true },
    sort: "hostname",
    depth: 0,
    limit: 0,
    pagination: false,
    overrideAccess: true,
  });
  return found.docs.map((d) => d.hostname);
}

export const domainsLabel = (hostnames: string[], lang: string = "fr") => (hostnames.length === 0 ? adminText(lang)("fonts.noDomain") : hostnames.join(", "));

export async function FontDomainsCell({ rowData, payload, i18n }: DefaultServerCellComponentProps) {
  const id = (rowData as { id?: number | string } | undefined)?.id;
  if (id == null) return null;
  return <span>{domainsLabel(await domainsUsingFont(payload, id), i18n?.language)}</span>;
}
