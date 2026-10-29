import { describe, expect, it } from "vitest";

import { AbConversions } from "../src/collections/AbConversions";
import { AbExposures } from "../src/collections/AbExposures";
import { ActivityLog } from "../src/collections/ActivityLog";
import { AdminImages } from "../src/collections/AdminImages";
import { ConsentRecords } from "../src/collections/ConsentRecords";
import { DataSubjectRequests } from "../src/collections/DataSubjectRequests";
import { Domains } from "../src/collections/Domains";
import { EdgeViewWindows } from "../src/collections/EdgeViewWindows";
import { Experiments } from "../src/collections/Experiments";
import { Fonts } from "../src/collections/Fonts";
import { Languages } from "../src/collections/Languages";
import { Leads } from "../src/collections/Leads";
import { LegalVersions } from "../src/collections/LegalVersions";
import { Media } from "../src/collections/Media";
import { OptInEmails } from "../src/collections/OptInEmails";
import { PageImports } from "../src/collections/PageImports";
import { PageStats } from "../src/collections/PageStats";
import { PageStatsHourly } from "../src/collections/PageStatsHourly";
import { Pages } from "../src/collections/Pages";
import { SiteImports } from "../src/collections/SiteImports";
import { Users } from "../src/collections/Users";
import { EdgeAccess } from "../src/globals/EdgeAccess";
import { Settings } from "../src/globals/Settings";

/**
 * 023-admin-i18n (T006, research R4, FR-010) — every label, description and
 * option label Trefle gives Payload is `{ fr, en }` (or a function), never a
 * plain string. Strict for every collection and global (T046): text that is
 * English today is `sameInBoth(...)` (FR-014).
 */

type Node = { [key: string]: unknown };
const isNode = (v: unknown): v is Node => typeof v === "object" && v !== null && !Array.isArray(v);

/** `null` when `value` is translated (or absent), else what is wrong with it. */
function problem(value: unknown): string | null {
  if (value === undefined || value === false || typeof value === "function") return null;
  if (typeof value === "string") return `plain string « ${value} »`;
  if (isNode(value)) {
    const missing = ["fr", "en"].filter((lang) => typeof value[lang] !== "string" || !(value[lang] as string).trim());
    return missing.length ? `missing ${missing.join(", ")}` : null;
  }
  return null;
}

/** Every untranslated text in a field list, with its path. */
export function untranslated(fields: unknown[], path: string): string[] {
  const out: string[] = [];
  const check = (value: unknown, where: string) => {
    const p = problem(value);
    if (p) out.push(`${where}: ${p}`);
  };
  for (const f of fields) {
    if (!isNode(f)) continue;
    const at = `${path}.${(f.name as string | undefined) ?? f.type}`;
    check(f.label, `${at} label`);
    if (isNode(f.labels)) for (const k of ["singular", "plural"]) check(f.labels[k], `${at} labels.${k}`);
    if (isNode(f.admin)) {
      check(f.admin.description, `${at} description`);
      check(f.admin.placeholder, `${at} placeholder`);
    }
    if (Array.isArray(f.options)) for (const o of f.options) if (isNode(o)) check(o.label, `${at} option ${String(o.value)}`);
    if (Array.isArray(f.fields)) out.push(...untranslated(f.fields, at));
    if (Array.isArray(f.tabs)) {
      for (const t of f.tabs) {
        if (!isNode(t)) continue;
        const tab = `${at}[${(t.name as string | undefined) ?? JSON.stringify(t.label)}]`;
        check(t.label, `${tab} label`);
        check(t.description, `${tab} description`);
        out.push(...untranslated((t.fields as unknown[]) ?? [], tab));
      }
    }
    if (Array.isArray(f.blocks)) for (const b of f.blocks) if (isNode(b)) out.push(...untranslated((b.fields as unknown[]) ?? [], `${at}.${String(b.slug)}`));
  }
  return out;
}

function untranslatedConfig(c: Node): string[] {
  const slug = String(c.slug);
  const out: string[] = [];
  const check = (value: unknown, where: string) => {
    const p = problem(value);
    if (p) out.push(`${slug} ${where}: ${p}`);
  };
  check(c.label, "label");
  if (isNode(c.labels)) for (const k of ["singular", "plural"]) check(c.labels[k], `labels.${k}`);
  if (isNode(c.admin)) {
    check(c.admin.group, "admin.group");
    check(c.admin.description, "admin.description");
  }
  return [...out, ...untranslated((c.fields as unknown[]) ?? [], slug)];
}

const CONFIGS = [
  AbConversions, AbExposures, ActivityLog, AdminImages, ConsentRecords, DataSubjectRequests, Domains, EdgeViewWindows,
  Experiments, Fonts, Languages, Leads, LegalVersions, Media, OptInEmails, PageImports, PageStats, PageStatsHourly,
  Pages, SiteImports, Users, EdgeAccess, Settings,
] as unknown as Node[];

describe("admin labels are in French and English", () => {
  it("finds plain strings and missing languages, nested ones included", () => {
    const found = untranslated(
      [
        { name: "a", type: "text", label: "Titre" },
        { name: "b", type: "text", label: { fr: "Titre", en: "Title" }, admin: { description: { fr: "Aide" } } },
        { name: "c", type: "select", options: [{ value: "x", label: "X" }, { value: "y", label: { fr: "Y", en: "Y" } }] },
        { type: "tabs", tabs: [{ label: "Onglet", fields: [{ name: "d", type: "text", label: () => "ok" }] }] },
        { name: "g", type: "group", fields: [{ name: "e", type: "text", admin: { description: "Aide" } }] },
      ],
      "x",
    );
    expect(found).toEqual([
      "x.a label: plain string « Titre »",
      "x.b description: missing en",
      "x.c option x: plain string « X »",
      'x.tabs["Onglet"] label: plain string « Onglet »',
      "x.g.e description: plain string « Aide »",
    ]);
  });

  it("no collection or global has untranslated text", () => {
    expect(CONFIGS.flatMap(untranslatedConfig)).toEqual([]);
  });

  // Regression (2026-10-28): a function `placeholder` on a select reached the
  // client field config and every signed-in admin page failed to render.
  it("puts no function where Payload hands it to client components", () => {
    const functions: string[] = [];
    const walk = (fields: unknown[], at: string) => {
      for (const f of fields) {
        if (!isNode(f)) continue;
        const here = `${at}.${(f.name as string | undefined) ?? f.type}`;
        if (isNode(f.admin) && typeof f.admin.placeholder === "function") functions.push(`${here} placeholder`);
        if (Array.isArray(f.fields)) walk(f.fields, here);
        if (Array.isArray(f.tabs)) for (const t of f.tabs) if (isNode(t)) walk((t.fields as unknown[]) ?? [], here);
        if (Array.isArray(f.blocks)) for (const b of f.blocks) if (isNode(b)) walk((b.fields as unknown[]) ?? [], here);
      }
    };
    for (const c of CONFIGS) walk((c.fields as unknown[]) ?? [], String(c.slug));
    expect(functions).toEqual([]);
  });

  it("the language fields themselves are translated (023 US1, US2)", () => {
    const pick = (c: Node, name: string) =>
      untranslated((c.fields as unknown[]) ?? [], String(c.slug)).filter((line) => line.includes(`.${name} `));
    expect(pick(Settings as unknown as Node, "adminLanguage")).toEqual([]);
    expect(pick(Users as unknown as Node, "adminLanguage")).toEqual([]);
    const all = JSON.stringify([Settings, Users], (_k, v) => (typeof v === "function" ? undefined : v));
    expect(all).toContain('"name":"adminLanguage"');
  });
});
