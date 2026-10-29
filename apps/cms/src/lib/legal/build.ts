import { createHash } from "node:crypto";

import type { Payload } from "payload";
import { sql } from "@payloadcms/db-postgres/drizzle";
import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import type { SerializedEditorState } from "lexical";

import { drizzleOf } from "../page-stats";

/**
 * 021-legal-pages (research R2, R3, R5, contracts/legal-api.md) — a domain's
 * privacy policy or legal notice, built from the editable texts of its
 * language, the operator's identity and suppliers, and the domain owner's
 * identity. Placeholders `{{key}}` are filled in the rich-text tree; a block
 * (paragraph, heading, list item) holding an empty or unknown placeholder is
 * left out whole, so no raw `{{…}}` ever reaches a page; a heading left with
 * nothing under it goes too (022). The version is the
 * hash of the resulting HTML; each new version is archived the first time it
 * is built.
 */
export type LegalKind = "privacy" | "notice";

type Node = { type: string; text?: string; children?: Node[]; [key: string]: unknown };
type RichText = { root: Node } | null | undefined;
type LanguageRef = { code?: string } | number | string | null | undefined;

export type LegalInputs = {
  operator: Partial<Record<"name" | "legalForm" | "registration" | "address" | "email" | "phone", string | null>>;
  suppliers: { name: string; role: string; location?: string | null; safeguards?: string | null; isHost?: boolean | null; address?: string | null; phone?: string | null }[];
  texts: { language: string; privacyPolicy?: RichText; legalNotice?: RichText; policyLinkLabel?: string | null; noticeLinkLabel?: string | null }[];
  retentionMonths: number;
  domain: {
    hostname: string;
    defaultLanguage?: string | null;
    consentBannerEnabled?: boolean | null;
    owner: Partial<Record<"name" | "legalForm" | "registration" | "address" | "email" | "director", string | null>>;
    extras: { language: string; privacyParagraph?: RichText; noticeParagraph?: RichText }[];
  };
};

const TOKEN = /\{\{\s*([\w.]+)\s*\}\}/g;
const BLOCKS = new Set(["paragraph", "heading", "listitem", "quote"]);

const text = (value: string): Node => ({ type: "text", text: value, format: 0, detail: 0, mode: "normal", style: "", version: 1 });
const block = (type: string, children: Node[], extra: Record<string, unknown> = {}): Node => ({
  type,
  children,
  direction: "ltr",
  format: "",
  indent: 0,
  version: 1,
  ...extra,
});

const textOf = (node: Node): string => (node.type === "text" ? (node.text ?? "") : (node.children ?? []).map(textOf).join(""));

/** The language row to use: requested, else the domain's default, else French. */
export function pickLanguage(texts: LegalInputs["texts"], requested: string | null | undefined, domainDefault: string | null | undefined): string {
  for (const code of [requested, domainDefault, "fr"]) if (code && texts.some((t) => t.language === code)) return code;
  return texts[0]?.language ?? "fr";
}

function values(inputs: LegalInputs): Map<string, string> {
  const map = new Map<string, string>();
  const put = (key: string, value: string | null | undefined) => {
    if (value && value.trim()) map.set(key, value.trim());
  };
  for (const [k, v] of Object.entries(inputs.operator)) put(`operator.${k}`, v);
  for (const [k, v] of Object.entries(inputs.domain.owner)) put(`owner.${k}`, v);
  const host = inputs.suppliers.find((s) => s.isHost);
  put("host.name", host?.name);
  put("host.address", host?.address);
  put("host.phone", host?.phone);
  put("site", inputs.domain.hostname);
  put("retention.leads", inputs.retentionMonths > 0 ? `${inputs.retentionMonths} mois` : null);
  return map;
}

function suppliersList(suppliers: LegalInputs["suppliers"]): Node | null {
  if (!suppliers.length) return null;
  const items = suppliers.map((s, i) => {
    const where = [s.location, s.safeguards].filter(Boolean).join(" — ");
    return block("listitem", [text(`${s.name} : ${s.role}${where ? ` (${where})` : ""}.`)], { value: i + 1 });
  });
  return block("list", items, { listType: "bullet", tag: "ul", start: 1 });
}

/** Fill one tree; returns the new children of root. */
function fill(nodes: Node[], vals: Map<string, string>, special: { suppliers: Node | null; extra: Node[]; bannerOn: boolean }): Node[] {
  const out: Node[] = [];
  for (const node of nodes) {
    if (BLOCKS.has(node.type)) {
      const content = textOf(node);
      const keys = [...content.matchAll(TOKEN)].map((m) => m[1]!);
      if (node.type === "paragraph" && keys.length === 1 && content.trim() === `{{${keys[0]}}}`) {
        if (keys[0] === "suppliers") {
          if (special.suppliers) out.push(special.suppliers);
          continue;
        }
        if (keys[0] === "extra") {
          out.push(...special.extra);
          continue;
        }
      }
      if (keys.includes("cookieBanner") && !special.bannerOn) continue;
      const others = keys.filter((k) => k !== "cookieBanner");
      if (others.some((k) => !vals.has(k))) continue;
      out.push(replaceIn(node, vals));
      continue;
    }
    if (node.children) {
      const children = fill(node.children, vals, special);
      if (node.type === "list" && children.length === 0) continue;
      out.push({ ...node, children });
      continue;
    }
    out.push(node);
  }
  return out;
}

const headingLevel = (node: Node): number | null =>
  node.type === "heading" && typeof node.tag === "string" ? Number(node.tag.slice(1)) || null : null;

/**
 * 022-ux-improvement (US3, contracts/legal.md) — drop a heading whose section
 * ended up empty: nothing but dropped deeper headings before the next heading
 * of the same or a higher level. Read backwards so a section knows whether
 * anything was kept below it.
 */
function dropEmptyHeadings(nodes: Node[]): Node[] {
  const hasContent = Array<boolean>(7).fill(false); // index = heading level 1–6
  const kept: Node[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i]!;
    const level = headingLevel(node);
    if (level === null) {
      kept.push(node);
      hasContent.fill(true);
      continue;
    }
    if (hasContent[level]) kept.push(node);
    for (let deeper = level; deeper < hasContent.length; deeper++) hasContent[deeper] = false;
  }
  return kept.reverse();
}

function replaceIn(node: Node, vals: Map<string, string>): Node {
  if (node.type === "text") {
    const replaced = (node.text ?? "")
      .replace(/\{\{\s*cookieBanner\s*\}\}\s*/g, "")
      .replace(TOKEN, (_m, key: string) => vals.get(key) ?? "");
    return { ...node, text: replaced };
  }
  return node.children ? { ...node, children: node.children.map((c) => replaceIn(c, vals)).filter((c) => c.type !== "text" || c.text !== "") } : node;
}

export type LegalPage = { html: string; version: string; language: string; title: string };

const TITLES: Record<LegalKind, string> = { privacy: "Politique de confidentialité", notice: "Mentions légales" };

/** Pure part: the page's HTML and version for these inputs. */
export function renderLegalPage(inputs: LegalInputs, kind: LegalKind, requested?: string | null): LegalPage {
  const language = pickLanguage(inputs.texts, requested, inputs.domain.defaultLanguage);
  const row = inputs.texts.find((t) => t.language === language);
  const source = kind === "privacy" ? row?.privacyPolicy : row?.legalNotice;
  const extraRow = inputs.domain.extras.find((e) => e.language === language);
  const extraSource = kind === "privacy" ? extraRow?.privacyParagraph : extraRow?.noticeParagraph;
  const vals = values(inputs);
  const special = { suppliers: suppliersList(inputs.suppliers), extra: [] as Node[], bannerOn: Boolean(inputs.domain.consentBannerEnabled) };
  special.extra = extraSource?.root?.children ? fill(structuredClone(extraSource.root.children), vals, { ...special, extra: [] }) : [];
  const children = source?.root?.children ? dropEmptyHeadings(fill(structuredClone(source.root.children), vals, special)) : [];
  const data = { root: { ...(source?.root ?? block("root", [])), type: "root", children } } as unknown as SerializedEditorState;
  const html = children.length ? convertLexicalToHTML({ data, disableContainer: true }) : "";
  const version = createHash("sha256").update(html).digest("hex").slice(0, 12);
  const label = kind === "privacy" ? row?.policyLinkLabel : row?.noticeLinkLabel;
  const title = language === "fr" || !label ? TITLES[kind] : label;
  return { html, version, language, title };
}

const codeOf = (ref: LanguageRef): string | null => (ref && typeof ref === "object" ? (ref.code ?? null) : null);

/** Load everything a legal page needs from Payload (depth 1 for language codes). */
export async function loadLegalInputs(payload: Payload, domainId: number | string): Promise<{ inputs: LegalInputs; domain: Record<string, unknown> } | null> {
  const domain = (await payload.findByID({ collection: "domains", id: domainId, depth: 1, overrideAccess: true }).catch(() => null)) as Record<string, unknown> | null;
  if (!domain || domain.isActive === false) return null;
  const settings = (await payload.findGlobal({ slug: "settings", depth: 1, overrideAccess: true })) as unknown as Record<string, unknown>;
  const texts = ((settings.legalTexts ?? []) as { language: LanguageRef; privacyPolicy?: RichText; legalNotice?: RichText; policyLinkLabel?: string; noticeLinkLabel?: string }[])
    .map((t) => ({ ...t, language: codeOf(t.language) ?? "" }))
    .filter((t) => t.language);
  const extras = ((domain.legalExtras ?? []) as { language: LanguageRef; privacyParagraph?: RichText; noticeParagraph?: RichText }[])
    .map((e) => ({ ...e, language: codeOf(e.language) ?? "" }))
    .filter((e) => e.language);
  return {
    domain,
    inputs: {
      operator: (settings.operator ?? {}) as LegalInputs["operator"],
      suppliers: (settings.suppliers ?? []) as LegalInputs["suppliers"],
      texts,
      retentionMonths: Number(settings.retentionMonths ?? 24),
      domain: {
        hostname: String(domain.hostname ?? ""),
        defaultLanguage: codeOf(domain.defaultLanguage as LanguageRef),
        consentBannerEnabled: domain.consentBannerEnabled as boolean | null,
        owner: (domain.owner ?? {}) as LegalInputs["domain"]["owner"],
        extras,
      },
    },
  };
}

/** Archive this version once (research R5); returns the date it was first published. */
export async function archiveVersion(payload: Payload, domainId: number | string, hostname: string, kind: LegalKind, page: LegalPage): Promise<string> {
  const db = drizzleOf(payload);
  await db.execute(sql`
    INSERT INTO legal_versions (domain_id, hostname, kind, language, version, html, updated_at, created_at)
    VALUES (${Number(domainId)}, ${hostname}, ${kind}, ${page.language}, ${page.version}, ${page.html}, now(), now())
    ON CONFLICT (domain_id, kind, language, version) DO NOTHING`);
  const { rows } = await db.execute(sql`
    SELECT created_at FROM legal_versions
    WHERE domain_id = ${Number(domainId)} AND kind = ${kind} AND language = ${page.language} AND version = ${page.version}`);
  const at = (rows[0] as { created_at?: string | Date } | undefined)?.created_at;
  return at ? new Date(at).toISOString() : new Date().toISOString();
}
