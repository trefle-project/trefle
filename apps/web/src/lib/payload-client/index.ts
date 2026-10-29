import { MEDIA_ALIASES_TAG, type Consent, type FontFile, type PageStatus } from "@trefle/shared";

import { log } from "../log";

/**
 * Thin, read-only client over Payload's REST API (T016).
 * The renderer never opens a DB connection and never imports `payload`.
 * Auth: an API key on the `service` user — `Authorization: users API-Key <key>`.
 *
 * See contracts/payload-collections.md §A.
 */

const base = (): string => process.env.CMS_API_URL ?? "http://cms:3000/api";

const authHeader = (): Record<string, string> => {
  const key = process.env.CMS_SERVICE_API_KEY;
  return key ? { Authorization: `users API-Key ${key}` } : {};
};

export class PayloadUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("Payload API unavailable");
    this.name = "PayloadUnavailableError";
    this.cause = cause;
  }
}

interface GetOptions {
  /** Next.js cache tags for on-demand revalidation (contracts/revalidation.md). */
  tags?: string[];
  /** Seconds; defaults to ISR fallback of 1h. */
  revalidate?: number;
}

async function get<T>(path: string, query: Record<string, string>, opts: GetOptions = {}): Promise<T> {
  const url = new URL(`${base()}${path}`);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { ...authHeader(), Accept: "application/json" },
      next: { tags: opts.tags, revalidate: opts.revalidate ?? 3600 },
    });
  } catch (err) {
    throw new PayloadUnavailableError(err);
  }
  if (res.status >= 500) throw new PayloadUnavailableError(`upstream ${res.status}`);
  if (!res.ok) throw new Error(`Payload GET ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

// --- Shapes (subset of what the renderer consumes) ---------------------------

export interface Domain {
  id: string;
  hostname: string;
  isActive: boolean;
  branding?: { faviconUrl?: string; defaultOgImage?: unknown; themeTokens?: unknown };
  notFoundPagePath?: string;
  defaultLanguage?: { code: string };
  /** 007-gtm-tagging, FR-001/FR-002 — empty ⇒ no GTM snippet for this domain. */
  gtmContainerId?: string;
  /** 007-gtm-tagging, FR-005 — independent of gtmContainerId. */
  consentBannerEnabled?: boolean;
  /** 021-legal-pages — the owner's own legal pages, when published elsewhere. */
  ownPrivacyPolicyUrl?: string | null;
  ownLegalNoticeUrl?: string | null;
  /** 015-penpot-site-import, User Story 4 — « Polices du domaine »; `files` expanded at depth 1. */
  fonts?: { family?: string; files?: (FontFileDoc | number | string)[] }[];
}

/** A stored font file (`fonts` collection), as expanded on a domain. */
export interface FontFileDoc {
  family: string;
  weight: number;
  style: "normal" | "italic";
  url?: string | null;
  unicodeRange?: string | null;
}

/** The domain's stored font files, ready for `fontFaceCss` (unexpanded or URL-less entries skipped). */
export function domainFontFiles(domain: Pick<Domain, "fonts"> | null | undefined): FontFile[] {
  const out: FontFile[] = [];
  for (const row of domain?.fonts ?? []) {
    for (const f of row?.files ?? []) {
      if (f && typeof f === "object" && f.url) {
        out.push({ family: f.family, weight: Number(f.weight), style: f.style === "italic" ? "italic" : "normal", url: f.url, unicodeRange: f.unicodeRange ?? null });
      }
    }
  }
  return out;
}

/**
 * Font files of a page's domain (015, FR-026). Accepts the page's `domain`
 * as an expanded document (no request) or an id (one cached request,
 * tagged like every domain read). Never throws: no fonts is a valid page.
 */
export async function getDomainFonts(domain: unknown): Promise<FontFile[]> {
  if (domain && typeof domain === "object" && "fonts" in domain) return domainFontFiles(domain as Domain);
  const id = domain && typeof domain === "object" ? (domain as { id?: unknown }).id : domain;
  if (id == null || id === "") return [];
  try {
    const d = await get<Domain>(`/domains/${encodeURIComponent(String(id))}`, { depth: "1" }, { tags: [`domain:${id}`] });
    return domainFontFiles(d);
  } catch {
    return [];
  }
}

/**
 * 017-edge-protection (contracts/media-aliases.md) — old media key → current
 * key, so pages written before a file replacement still show the image.
 * Never fails a render: any error is an empty map (and a warning).
 *
 * Kept 60 s at most, not the usual hour: the CMS sends the tag invalidation
 * from `afterChange`, before its transaction commits, so a render landing in
 * between can re-cache the old map. The cap bounds that to a minute (SC-005);
 * the invalidation still makes the usual case immediate.
 */
export async function getMediaAliases(): Promise<Record<string, string>> {
  try {
    const res = await get<{ aliases?: Record<string, string> }>("/media/aliases", {}, { tags: [MEDIA_ALIASES_TAG], revalidate: 60 });
    return res.aliases ?? {};
  } catch (err) {
    log.warn("media aliases unavailable", { err: String(err) });
    return {};
  }
}

export interface FormFieldConfig {
  name: string;
  label: string;
  type: "email" | "text" | "textarea" | "select" | "checkbox" | "tel" | "radio" | "number" | "date";
  required?: boolean;
  options?: { label: string; value: string }[];
}

export interface PublishedPage {
  id: string;
  title: string;
  path: string;
  domain: string;
  status?: PageStatus;
  publishedAt?: string;
  /** 007-gtm-tagging, research.md §3 — the consent banner's language (FR-014). */
  language?: { code: string };
  seo?: { metaTitle?: string; metaDescription?: string; ogImage?: unknown };
  builder: { html: string; css: string };
  form: {
    fields: FormFieldConfig[];
    submitLabel: string;
    successMessage: string;
    consentPurposeText: string;
    privacyNoticeUrl: string;
    privacyNoticeVersion: string;
  };
  /** 014-custom-code-editing — admin-only code (only the service account can read it). */
  customCode?: PageCustomCode;
}

/** A page script or code-block snippet; `consent` absent means "consent" (the safe side). */
export interface CodeSnippet {
  code?: string | null;
  consent?: Consent | null;
}

export interface PageCustomCode {
  head?: CodeSnippet;
  bodyEnd?: CodeSnippet;
  blocks?: (CodeSnippet & { codeId: string })[];
}

interface Paginated<T> {
  docs: T[];
  totalDocs: number;
}

// --- Queries ---------------------------------------------------------------

export async function getActiveDomainByHost(hostname: string): Promise<Domain | null> {
  const data = await get<Paginated<Domain>>(
    "/domains",
    {
      "where[hostname][equals]": hostname.toLowerCase(),
      "where[isActive][equals]": "true",
      limit: "1",
      // 007-gtm-tagging, research.md §6 — depth 1 so `defaultLanguage`
      // expands to `{ code }` (the /unsubscribe, /confirm banner-language
      // fallback), not a bare id.
      depth: "1",
    },
    { tags: [`domain:host:${hostname.toLowerCase()}`] },
  );
  return data.docs[0] ?? null;
}

export async function getPublishedPage(domainId: string, path: string): Promise<PublishedPage | null> {
  const data = await get<Paginated<PublishedPage>>(
    "/pages",
    {
      "where[domain][equals]": domainId,
      "where[path][equals]": path,
      "where[status][equals]": "published",
      limit: "1",
      depth: "1",
    },
    { tags: [`domain:${domainId}`, "page-list"] },
  );
  const page = data.docs[0] ?? null;
  if (page) {
    // add the page-scoped tag once we know the id
    return page;
  }
  return null;
}

export interface CookieBannerTranslation {
  language: { code: string };
  title: string;
  body: string;
  acceptLabel: string;
  rejectLabel: string;
  revisitLabel: string;
}

/** 021-legal-pages — one language row of the legal texts (the renderer only reads the link labels). */
export interface LegalTextRow {
  language: { code: string } | string | number;
  policyLinkLabel?: string | null;
  noticeLinkLabel?: string | null;
}

/** 021-legal-pages (contracts/legal-api.md) — a domain's built legal page. */
export interface LegalPageData {
  html: string;
  version: string;
  versionDate: string | null;
  language: string;
  title: string;
  ownUrl: string | null;
}

/** 021-legal-pages — GET /api/legal/:kind, cached with the tags a text or domain save revalidates. */
export async function getLegalPage(kind: "privacy" | "notice", domainId: string | number, lang?: string | null): Promise<LegalPageData> {
  return get<LegalPageData>(
    `/legal/${kind}`,
    { domain: String(domainId), ...(lang ? { lang } : {}) },
    { tags: ["settings", `domain:${domainId}`] },
  );
}

/** 007-gtm-tagging, FR-014 — the workspace-wide `settings` global's cookie-banner copy (+ 021 legal link labels). */
export async function getSettings(): Promise<{ cookieBannerTranslations: CookieBannerTranslation[]; legalTexts?: LegalTextRow[] }> {
  return get<{ cookieBannerTranslations: CookieBannerTranslation[]; legalTexts?: LegalTextRow[] }>(
    "/globals/settings",
    { depth: "1" },
    { tags: ["settings"] },
  );
}

export async function getPageStatus(id: string | number): Promise<PageStatus | null> {
  try {
    const data = await get<{ status?: PageStatus }>(`/pages/${id}`, { depth: "0", select: "status" });
    return data.status ?? null;
  } catch (err) {
    if (err instanceof PayloadUnavailableError) throw err;
    return null;
  }
}

/**
 * Full page for the submission endpoint (T047) and, since
 * 009-lead-form-error-recovery, for `/form-retry`'s re-render too
 * (research.md §5) — the underlying request already returns the full
 * document (no `select` param is set), so widening the return type from a
 * `Pick<>` costs nothing extra over the network, only removes an
 * artificial type-level restriction.
 */
export async function getPageForSubmission(id: string | number): Promise<PublishedPage | null> {
  try {
    // 007-gtm-tagging, research.md §3 — depth 1 so `language` expands to
    // `{ code }` for the dataLayer/consent-banner fallback on this path.
    return await get<PublishedPage>(
      `/pages/${id}`,
      { depth: "1" },
      { tags: [`page:${id}`] },
    );
  } catch (err) {
    if (err instanceof PayloadUnavailableError) throw err;
    return null;
  }
}

/** Draft-or-published page for the authenticated preview route (T049a). */
export async function getPagePreview(id: string | number): Promise<(PublishedPage & { status: PageStatus }) | null> {
  const url = new URL(`${base()}/page-preview`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ pageId: id }),
      cache: "no-store",
    });
  } catch (err) {
    throw new PayloadUnavailableError(err);
  }
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`page-preview -> ${res.status}`);
  return (await res.json()) as PublishedPage & { status: PageStatus };
}

/** POST a lead through the CMS service endpoint (T047). */
export async function postLeadIntake(payload: Record<string, unknown>): Promise<{
  ok: boolean;
  leadId?: string | number;
  unsubscribeUrl?: string;
  successMessage?: string;
  duplicate?: boolean;
  code?: string;
  /** 003-post-launch-improvements, FR-010 — set only when the submitted page has one selected. */
  confirmationPage?: { id: string | number; path: string };
}> {
  let res: Response;
  try {
    res = await fetch(`${base()}/lead-intake`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (err) {
    throw new PayloadUnavailableError(err);
  }
  if (res.status >= 500) throw new PayloadUnavailableError(`upstream ${res.status}`);
  return (await res.json()) as Awaited<ReturnType<typeof postLeadIntake>>;
}

/** Fire-and-forget view ping (T045). */
export async function pingPageView(pageId: string | number): Promise<void> {
  try {
    await fetch(`${base()}/page-view`, {
      method: "POST",
      headers: { ...authHeader(), "Content-Type": "application/json" },
      body: JSON.stringify({ pageId }),
      cache: "no-store",
    });
  } catch {
    /* best effort */
  }
}

/**
 * 020-edge-html-cache (contracts/edge-ingest.md) — page views counted at the
 * edge, per minute window, to the CMS's idempotent batch intake. Returns the
 * CMS status so the edge route can tell the Worker to re-send (it re-sends
 * the last 10 windows every minute anyway).
 */
export async function postPageViewBatch(windows: { start: string; counts: Record<string, number> }[]): Promise<number> {
  const res = await fetch(`${base()}/page-views/batch`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ windows }),
    cache: "no-store",
  });
  return res.status;
}

/** 018-ab-significance — first A/B exposures from the edge, to the CMS's idempotent intake. */
export async function postAbExposureBatch(exposures: unknown[]): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${base()}/ab-exposure-batch`, {
    method: "POST",
    headers: { ...authHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ exposures }),
    cache: "no-store",
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

// --- 008-ab-testing ----------------------------------------------------------

/** A published page fetched directly by id (`ab-variant/[pageId]` — a test variant
 * or the control, never a draft). Distinct from `getPagePreview`, which
 * returns *any* status behind a signed token for the CMS-linked preview flow. */
export async function getPublishedPageById(id: string | number): Promise<PublishedPage | null> {
  const data = await get<Paginated<PublishedPage>>(
    "/pages",
    { "where[id][equals]": String(id), "where[status][equals]": "published", limit: "1", depth: "1" },
    { tags: [`page:${id}`] },
  );
  return data.docs[0] ?? null;
}

export interface RunningTest {
  experimentKey: string;
  /** Variant page ids in a stable order — the control's own id is included
   * as one of the arms (spec.md: "the original itself counts as a variant"). */
  variantIds: string[];
}

/**
 * research.md §2/§3 — middleware's bucketing decision is sourced entirely
 * from Payload (which page has a running test, and its variant ids), never
 * from a live GrowthBook call: GrowthBook is the *stats* engine (queried
 * separately, off the request path, via its own Postgres datasource
 * connection), not part of this hot path. Any failure here — network,
 * malformed response, anything — resolves to `null` ("no test running")
 * rather than throwing, so a lookup problem degrades to serving the
 * control, never a broken page (FR-016).
 */
export async function getRunningTestFor(domainId: string | number, path: string): Promise<RunningTest | null> {
  try {
    const running = await get<
      Paginated<{ id: string; growthbookExperimentKey?: string; controlPage: { id: string; domain: string; path: string } }>
    >("/experiments", { "where[status][equals]": "running", depth: "1", limit: "50" }, { tags: ["ab-tests"] });

    const match = running.docs.find(
      (e) => String(e.controlPage?.domain) === String(domainId) && e.controlPage?.path === path,
    );
    if (!match || !match.growthbookExperimentKey) return null;

    const variants = await get<Paginated<{ id: string | number }>>(
      "/pages",
      { "where[experimentOf][equals]": String(match.controlPage.id), "where[status][equals]": "published", limit: "50", depth: "0" },
      { tags: [`ab-test:${match.controlPage.id}`] },
    );
    // Postgres ids come back as numbers, not strings — normalise once here
    // so every downstream comparison (the cookie value, `.includes()`) is a
    // plain string compare, never a silent number/string mismatch.
    const variantIds = [String(match.controlPage.id), ...variants.docs.map((d) => String(d.id))];
    if (variantIds.length < 2) return null; // a control with no published variants isn't a live test

    return { experimentKey: match.growthbookExperimentKey, variantIds };
  } catch {
    return null;
  }
}

/**
 * 023-admin-i18n (US6) — the language code of the page a lead came from, for
 * /confirm and /unsubscribe. Null when unknown or the CMS is unreachable: the
 * page then falls back to the domain's default language.
 */
export async function getLeadLanguage(leadId: string | number): Promise<string | null> {
  try {
    const data = await get<{ language?: string | null }>(`/lead-language/${leadId}`, {}, { revalidate: 0 });
    return data.language ?? null;
  } catch {
    return null;
  }
}
