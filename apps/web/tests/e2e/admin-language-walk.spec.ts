import { expect, test, type Browser, type Page } from "@playwright/test";

import { adminToken as sharedAdminToken } from "./fixtures";

/**
 * 023-admin-i18n (Polish, T065–T066, SC-001/SC-002) — the core admin screens
 * in one language meet no interface word of the other: Pages (list, creation
 * wizard, editor, A/B tab), imports, Pages Stats, experiments with their
 * verdict, leads and their export, members, Settings, the account.
 *
 * The language comes from the `payload-lng` cookie, the one a member's saved
 * choice sets (admin-language.spec.ts covers the saving): the walk changes no
 * shared state, so parallel specs are not disturbed. Text written by people
 * (table cells, the editor's canvas, field values) is not read; the stop-lists
 * hold interface words only. The two-factor screens run against a second cms
 * (admin-totp.spec.ts) and are not part of this walk.
 */
const CMS_URL = process.env.CMS_URL ?? "http://localhost:3000";
const ADMIN_URL = process.env.CMS_ADMIN_URL ?? `${CMS_URL}/admin`;
const CMS_API = process.env.CMS_API_URL ?? `${CMS_URL}/api`;

const FRENCH = [
  "Enregistrer",
  "Rechercher",
  "Paramètres",
  "Pages publiées",
  "Créer",
  "Annuler",
  "Supprimer",
  "Déconnexion",
  "Tableau de bord",
  "Filtres",
  "Colonnes",
  "Brouillon",
  "Publié",
  "Modifier",
  "Ajouter",
  "Domaine",
  "Langue",
  "Titre",
  "Rapports",
  "Membres",
  "Tous les",
  "Aucun",
  "Résultats",
  "Vues",
  "Période",
  "Leads consentis",
  "Ouvrir",
  "Fermer",
  "Retour",
  "Suivant",
  "Importer",
];
// The framework's own words, now French in the French admin.
const ENGLISH = [
  "Save",
  "Create new",
  "Add new",
  "Search",
  "Cancel",
  "Delete",
  "Log out",
  "Dashboard",
  "Filters",
  "Columns",
  "Sort by",
  "Show all",
  "Ascending",
  "Descending",
  "No results",
  "Per page",
  "Loading",
  "Edit",
  "Open",
  "Close",
  "Back",
  "Next",
  "Previous",
  "Views",
  "Period",
  "Consented leads",
  "All leads",
];
/**
 * English in the French admin too, removed before the French walk reads a
 * line: Trefle's labels that were English before 023 (FR-014, `sameInBoth`,
 * and field names Payload shows as their label), and the rich-text editor's
 * own untranslated buttons (FR-013, Payload's Lexical). Longest first.
 */
const KEPT_ENGLISH = [
  "Shown next to the consent checkbox. Defaults from Settings.",
  "Settings → Default",
  "Pages Import",
  "Penpot Import",
  "Published At",
  "Meta Title",
  "Add block",
  "Edit link",
];

async function api(path: string, token: string) {
  return fetch(`${CMS_API}${path}`, { headers: { authorization: `JWT ${token}` } });
}

async function adminPage(browser: Browser, token: string, lang: "en" | "fr") {
  const context = await browser.newContext({ timezoneId: "Europe/Paris" });
  await context.addCookies([{ name: "payload-lng", value: lang, url: CMS_URL }]);
  await context.route(`${CMS_URL}/**`, (route) => {
    const req = route.request();
    if (!["document", "fetch", "xhr"].includes(req.resourceType())) return route.continue();
    return route.continue({ headers: { ...req.headers(), authorization: `JWT ${token}` } });
  });
  return context.newPage();
}

/** The screen's visible interface text: people's content (table cells, the canvas, fields) left out. */
async function interfaceText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const skip =
      "tbody td, .gjs-frame-wrapper, .gjs-layers, .rich-text, [contenteditable], .react-select__single-value, .react-select__multi-value";
    const out: string[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || el.closest(skip) || el.closest("script, style, noscript")) continue;
      if (!el.checkVisibility()) continue;
      out.push(node.textContent ?? "");
    }
    for (const el of document.querySelectorAll<HTMLElement>(
      "[title], [aria-label], [placeholder]",
    )) {
      if (el.closest(skip) || !el.checkVisibility()) continue;
      for (const attr of ["title", "aria-label", "placeholder"])
        out.push(el.getAttribute(attr) ?? "");
    }
    return out.join("\n");
  });
}

/** Each interface line holding a word of the other language, once. */
const found = (text: string, words: string[], kept: string[] = []) => {
  const res = words.map(
    (w) => new RegExp(`(^|[^\\p{L}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}])`, "u"),
  );
  const lines = text.split("\n").map((l) => l.trim());
  const unkept = (line: string) => kept.reduce((rest, k) => rest.replaceAll(k, " "), line);
  return [...new Set(lines.filter((l) => res.some((re) => re.test(unkept(l)))))];
};

for (const [lang, others, kept, label] of [
  ["en", FRENCH, [], "an English admin meets no French interface word"],
  [
    "fr",
    ENGLISH,
    KEPT_ENGLISH,
    "a French admin meets no English interface word other than the kept ones",
  ],
] as const) {
  test(label, async ({ browser }) => {
    test.setTimeout(240_000);
    const token = (await sharedAdminToken()) ?? "";
    test.skip(!token, "no admin token (global-setup)");

    const pages = (await (await api("/pages?limit=1&depth=0&sort=-updatedAt", token)).json()) as {
      docs: { id: number }[];
    };
    const experiments = (await (
      await api("/experiments?limit=1&depth=0&sort=-updatedAt", token)
    ).json()) as { docs: { id: number }[] };
    const me = (await (await api("/users/me", token)).json()) as { user: { id: number } };
    const pageId = pages.docs[0]?.id;
    const screens = [
      "",
      "/collections/pages",
      "/collections/pages/wizard",
      ...(pageId
        ? [`/collections/pages/${pageId}`, `/collections/pages/${pageId}/experiments`]
        : []),
      "/collections/page-imports",
      "/collections/page-stats",
      "/collections/experiments",
      ...(experiments.docs[0] ? [`/collections/experiments/${experiments.docs[0].id}`] : []),
      "/collections/leads",
      "/collections/users",
      `/collections/users/${me.user.id}`,
      "/globals/settings",
      "/account",
    ];

    const page = await adminPage(browser, token, lang);
    const met: Record<string, string[]> = {};
    for (const screen of screens) {
      await page.goto(`${ADMIN_URL}${screen}`);
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
      // The list, form or editor has hydrated.
      await expect(page.locator(".template-default__wrap, .template-minimal").first()).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForLoadState("networkidle");
      const words = found(await interfaceText(page), others, [...kept]);
      if (words.length) met[screen || "/"] = words;
    }
    expect(met).toEqual({});
  });
}
