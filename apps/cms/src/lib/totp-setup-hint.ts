import type { Config } from "payload";

import { adminText } from "../i18n";

/**
 * 019-admin-access (contracts/cms-endpoints.md, « Setup page hint », research
 * R5) — the plugin has no recovery codes: the setup key shown under the QR
 * code, saved in the team's password manager, is the member's backup. Appended
 * to the plugin's setup description, which the view renders above the
 * QR code. Must run after payloadTotp, whose translations would win otherwise.
 */
type Translations = Record<string, { totpPlugin?: { setup?: { description?: string } } }>;

/**
 * Added to the French and English descriptions, each in its own language
 * (023-admin-i18n).
 */
const LANGUAGES = ["fr", "en"];

export const totpSetupHint = (config: Config): Config => {
  const translations = { ...((config.i18n?.translations ?? {}) as Translations) };
  for (const lang of LANGUAGES) {
    const t = translations[lang];
    const description = t?.totpPlugin?.setup?.description;
    if (!t?.totpPlugin?.setup || description == null) continue;
    translations[lang] = {
      ...t,
      totpPlugin: {
        ...t.totpPlugin,
        setup: { ...t.totpPlugin.setup, description: `${description}</p><p><strong>${adminText(lang)("members.totpHint")}</strong>` },
      },
    };
  }
  return { ...config, i18n: { ...config.i18n, translations: translations as never } };
};
