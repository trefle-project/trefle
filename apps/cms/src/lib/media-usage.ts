import type { Payload, Where } from "payload";

/**
 * 017-edge-protection (contracts/media-usage.md, research R21) — where a media
 * item is used, so an editor is warned before overwriting it and a used image
 * cannot be deleted. Computed on request: pages reference images by URL in
 * their GrapesJS HTML/CSS, not through a relationship.
 */
export type PageUsage = {
  id: number;
  title: string;
  domain: string | null;
  path: string | null;
  status: "draft" | "published";
  isVariant: boolean;
  via: "content" | "shareImage";
  adminUrl: string;
};

export type DomainUsage = {
  id: number;
  hostname: string;
  via: "defaultShareImage" | "favicon";
  adminUrl: string;
};

export type MediaUsage = { pages: PageUsage[]; domains: DomainUsage[]; total: number };

type MediaDoc = { id: number | string; filename?: string | null; previousFilenames?: { filename?: string | null }[] | null };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** `/<key>` not followed by another file-name character (`/a.jpg` ≠ `/a.jpg.bak`, `/big-a.jpg` ≠ `/a.jpg`). */
const keyPattern = (keys: string[]) => new RegExp(`/(?:${keys.map(escapeRe).join("|")})(?![\\w.-])`);

const idOf = (v: unknown): number | string | null =>
  v == null ? null : typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : (v as number | string);

export function mediaKeys(media: MediaDoc): string[] {
  const keys = [media.filename, ...(media.previousFilenames ?? []).map((p) => p.filename)];
  return [...new Set(keys.filter((k): k is string => Boolean(k)))];
}

export async function findMediaUsage(payload: Payload, media: MediaDoc): Promise<MediaUsage> {
  const keys = mediaKeys(media);
  const pattern = keys.length > 0 ? keyPattern(keys) : null;

  const contentWhere = keys.flatMap((k): Where[] => [
    { "builder.html": { contains: `/${k}` } },
    { "builder.css": { contains: `/${k}` } },
  ]);
  const pages = await payload.find({
    collection: "pages",
    where: { or: [...contentWhere, { "seo.ogImage": { equals: media.id } }] },
    select: { title: true, path: true, status: true, domain: true, experimentOf: true, builder: true, seo: true },
    depth: 1,
    pagination: false,
    overrideAccess: true,
  });

  const pageUsage: PageUsage[] = [];
  for (const p of pages.docs) {
    const inContent = pattern !== null && (pattern.test(p.builder?.html ?? "") || pattern.test(p.builder?.css ?? ""));
    const isShare = String(idOf(p.seo?.ogImage)) === String(media.id);
    if (!inContent && !isShare) continue;
    pageUsage.push({
      id: p.id,
      title: p.title,
      domain: typeof p.domain === "object" && p.domain ? p.domain.hostname : null,
      path: p.path ?? null,
      status: p.status,
      isVariant: idOf(p.experimentOf) != null,
      via: inContent ? "content" : "shareImage",
      adminUrl: `/admin/collections/pages/${p.id}`,
    });
  }
  pageUsage.sort(
    (a, b) => (a.status === b.status ? a.title.localeCompare(b.title, "fr") : a.status === "published" ? -1 : 1),
  );

  const domains = await payload.find({
    collection: "domains",
    where: {
      or: [
        { "branding.defaultOgImage": { equals: media.id } },
        ...keys.map((k) => ({ "branding.faviconUrl": { contains: `/${k}` } })),
      ],
    },
    select: { hostname: true, branding: true },
    depth: 0,
    pagination: false,
    overrideAccess: true,
  });

  const domainUsage: DomainUsage[] = [];
  for (const d of domains.docs) {
    const adminUrl = `/admin/collections/domains/${d.id}`;
    if (String(idOf(d.branding?.defaultOgImage)) === String(media.id)) {
      domainUsage.push({ id: d.id, hostname: d.hostname, via: "defaultShareImage", adminUrl });
    }
    if (pattern?.test(d.branding?.faviconUrl ?? "")) {
      domainUsage.push({ id: d.id, hostname: d.hostname, via: "favicon", adminUrl });
    }
  }

  return { pages: pageUsage, domains: domainUsage, total: pageUsage.length + domainUsage.length };
}
