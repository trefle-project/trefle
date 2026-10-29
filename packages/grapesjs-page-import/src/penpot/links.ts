import type { Interaction, Shape } from "./model";

/**
 * Penpot prototype interactions → links (015-penpot-site-import, research
 * P10, FR-016–FR-018). Only a click can make a link: « Naviguer vers » a
 * board ticked in this import → that page's path; « Ouvrir une URL » →
 * http(s), mailto: or tel: addresses. Everything else is reported.
 */

/** The 012 serializer's rule, minus same-page anchors: an import has no anchors to point at. */
const SAFE_HREF_RE = /^(?:https?:\/\/[^\s"'<>]+|mailto:[^\s"'<>]+|tel:[+0-9().\s-]+)$/i;

export type LinkTarget = { href: string };

export type LinkReport = {
  /** Interactions that could not become links, or that are not links at all. */
  omitted: { what: string; reason: "interaction" }[];
};

const label = (s: Shape) => (s.name || "élément").slice(0, 80);

/**
 * The link a shape carries, if any. `paths` maps ticked board ids to their
 * page path. Reports what it drops into `report`.
 */
export function linkFor(
  s: Shape,
  paths: Record<string, string>,
  report: LinkReport,
): LinkTarget | null {
  const list = (s.interactions ?? []).filter((i): i is Interaction =>
    Boolean(i && typeof i === "object"),
  );
  if (!list.length) return null;
  let link: LinkTarget | null = null;
  for (const i of list) {
    if (i.eventType !== "click") {
      report.omitted.push({
        what: `Interaction « ${i.eventType ?? "?"} » sur « ${label(s)} » (non reprise)`,
        reason: "interaction",
      });
      continue;
    }
    if (link) continue;
    if (i.actionType === "navigate") {
      const path = i.destination ? paths[i.destination] : undefined;
      if (path) link = { href: path };
      else
        report.omitted.push({
          what: `Lien de « ${label(s)} » vers un board non importé`,
          reason: "interaction",
        });
    } else if (i.actionType === "open-url") {
      const url = typeof i.url === "string" ? i.url.trim() : "";
      if (SAFE_HREF_RE.test(url)) link = { href: url };
      else
        report.omitted.push({
          what: `Lien de « ${label(s)} » vers une adresse non autorisée`,
          reason: "interaction",
        });
    } else {
      report.omitted.push({
        what: `Interaction « ${i.actionType ?? "?"} » sur « ${label(s)} » (non reprise)`,
        reason: "interaction",
      });
    }
  }
  return link;
}
