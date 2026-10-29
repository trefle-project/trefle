import { ALLOWED_ATTR, ALLOWED_TAGS, SANITIZE_CONFIG } from "@trefle/shared";

import { adminText, type AdminText } from "../../i18n";

/**
 * 014-custom-code-editing, FR-014 — turns what the publication sanitizer
 * would drop from the « Code » view's HTML into plain lines (the member's language), so an
 * editor is told before applying, never after publishing.
 *
 * Input is DOMPurify's own `removed` list after
 * `DOMPurify.sanitize(html, WARNING_SANITIZE_CONFIG)` — the config publication
 * uses (FR-015). Typed structurally (not imported from `dompurify`) so this
 * module stays pure and testable in node. Kept out of codeView.ts, which
 * pulls in the browser-only `dompurify` — same reasoning as exportHtml.ts.
 */

export type RemovedEntry =
  | { element: { nodeType: number; nodeName: string } }
  | { attribute: { name: string; value: string } | null; from: { nodeName: string } };

/**
 * Config for the warning pass: publication's, plus `FORCE_BODY`. Without it
 * the HTML parser moves a *leading* `<style>`/`<script>`/`<meta>` into
 * `<head>`, which DOMPurify then discards without listing it in `removed` —
 * exactly the silent drop FR-014 forbids. Publication drops those elements
 * either way, so forcing them into the body only makes them visible here.
 */
export const WARNING_SANITIZE_CONFIG = { ...SANITIZE_CONFIG, FORCE_BODY: true };

const FORM_TAGS = new Set(["form", "input", "select", "textarea", "option", "optgroup", "fieldset", "legend", "label", "datalist", "output"]);
// Parser scaffolding DOMPurify may report when wrapping a fragment; never
// user-meaningful. `remove` is the throw-away element FORCE_BODY prepends.
const IGNORED_TAGS = new Set(["html", "head", "body", "remove"]);
const URI_ATTRS = new Set(["href", "src", "xlink:href", "poster", "srcset", "cite"]);

const shorten = (v: string, max = 40) => (v.length > max ? `${v.slice(0, max)}…` : v);

export function droppedMarkupMessages(removed: readonly RemovedEntry[], t: AdminText = adminText("fr")): string[] {
  const out = new Set<string>();
  for (const entry of removed) {
    if ("element" in entry) {
      const { element } = entry;
      if (element.nodeType !== 1) continue; // comments, stray text
      const tag = element.nodeName.toLowerCase();
      if (IGNORED_TAGS.has(tag)) continue;
      if (tag === "script") out.add(t("editor.msgScript"));
      else if (tag === "style") out.add(t("editor.msgStyle"));
      else if (FORM_TAGS.has(tag)) out.add(t("editor.msgForm"));
      else out.add(t("editor.msgTag", { tag }));
      continue;
    }
    const { attribute, from } = entry;
    if (!attribute) continue;
    const name = attribute.name.toLowerCase();
    const tag = from.nodeName.toLowerCase();
    // The element itself is dropped (and already reported): its attributes go with it.
    if (!ALLOWED_TAGS.includes(tag)) continue;
    if (name.startsWith("on")) {
      out.add(t("editor.msgEventAttr", { name }));
    } else if (URI_ATTRS.has(name) && ALLOWED_ATTR.includes(name)) {
      // Allowed attribute, rejected value: an unsafe address (javascript:, data:text/html…).
      out.add(t("editor.msgUrl", { value: shorten(attribute.value), name, tag }));
    } else {
      out.add(t("editor.msgAttr", { name, tag }));
    }
  }
  return [...out];
}
