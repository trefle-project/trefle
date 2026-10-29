import { describe, expect, it } from "vitest";

import { effectiveLanguage, formatEur, formatNumber, formatPercent, intlLocale, isAdminLanguage, isPlural } from "../src/lib/admin-locale";

/** 023-admin-i18n (T005) — which language a member gets, and numbers per language. */
describe("effectiveLanguage", () => {
  it("prefers the member's choice, then the installation's, then English", () => {
    expect(effectiveLanguage({ adminLanguage: "fr" }, { adminLanguage: "en" })).toBe("fr");
    expect(effectiveLanguage({ adminLanguage: null }, { adminLanguage: "fr" })).toBe("fr");
    expect(effectiveLanguage(undefined, { adminLanguage: "fr" })).toBe("fr");
    expect(effectiveLanguage(null, null)).toBe("en");
  });

  it("ignores values that are not an admin language", () => {
    expect(effectiveLanguage({ adminLanguage: "de" }, { adminLanguage: "fr" })).toBe("fr");
    expect(effectiveLanguage({ adminLanguage: "" }, { adminLanguage: "xx" })).toBe("en");
    expect(isAdminLanguage("FR")).toBe(false);
  });
});

describe("number formats", () => {
  // Intl's French separators: narrow no-break space for thousands, no-break space before % and €.
  it("groups and separates decimals per language", () => {
    expect(formatNumber(1234.5, "fr")).toBe("1 234,5");
    expect(formatNumber(1234.5, "en")).toBe("1,234.5");
  });

  it("formats percentages and euros", () => {
    expect(formatPercent(0.123, "fr")).toBe("12,3 %");
    expect(formatPercent(0.123, "en")).toBe("12.3%");
    expect(formatEur(12.5, "fr")).toBe("12,50 €");
    expect(formatEur(12.5, "en")).toBe("€12.50");
  });

  it("puts 0 in the singular in French, in the plural in English", () => {
    expect([0, 1, 2].map((n) => isPlural(n, "fr"))).toEqual([false, false, true]);
    expect([0, 1, 2].map((n) => isPlural(n, "en"))).toEqual([true, false, true]);
  });

  it("maps each language to a day-month-year locale", () => {
    expect(intlLocale("fr")).toBe("fr-FR");
    expect(intlLocale("en")).toBe("en-GB");
  });
});
