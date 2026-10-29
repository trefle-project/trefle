"use client";

import type { ImportReport } from "@trefle/grapesjs-page-import/serialize";
import { useDocumentInfo, useFormFields } from "@payloadcms/ui";
import React from "react";

import type { AdminText } from "../i18n";
import { useAdminText } from "../i18n/useAdminText";
import { isPlural } from "../lib/admin-locale";
import { summariseDeviceChecks } from "../lib/import/device-summary";
import { reportLine } from "../lib/import/report-text";

/**
 * 012-url-page-import (T047, FR-019) — the import report at the top of an
 * imported page's edit view: what was reproduced, simplified or left out,
 * accessibility and screen-format findings, and what to do before
 * publishing.
 *
 * - « Masquer le rapport » folds it (accordion): only its title line stays,
 *   with « Afficher le rapport » to reopen it. The fold is remembered in the
 *   viewer's browser (localStorage, per import), a convenience only.
 * - « Supprimer le rapport », after a confirmation, removes it for everyone
 *   for good: stored on the import (`reportDismissed`).
 *
 * A `ui` field on Pages.ts, rendered only when `importedFrom` is set.
 *
 * 015-penpot-site-import (T030) — also for a page created by a site import
 * (`siteImport`): its report is the import's `boards` row for this page, and
 * « Supprimer le rapport » adds the page to the import's `dismissedReports`.
 */
type ImportDoc = { id: number; report?: ImportReport | null; reportDismissed?: boolean | null; sourceFileName?: string | null };
type SiteImportDoc = {
  id: number;
  fileName?: string | null;
  penpotFileName?: string | null;
  dismissedReports?: unknown;
  boards?: { name: string; page?: number | { id: number } | null; report?: ImportReport | null }[] | null;
};
/** What the panel shows, from either kind of import. */
type Loaded = {
  report: ImportReport | null;
  source: React.ReactNode;
  /** 012/013 only: the source page had no mobile layout of its own. */
  penpot: boolean;
  dismiss: () => Promise<void>;
  collapseKey: string;
};

const refId = (v: unknown) => (typeof v === "object" && v !== null ? (v as { id?: unknown }).id : v);

// Codes stored in the report, named in the reader's language (023).
const BLOCKS = ["hero", "rich-text", "image", "call-to-action", "testimonial", "lead-form"] as const;
const A11Y = ["missing-alt", "low-contrast", "heading-skip", "empty-link", "contrast-unverifiable"] as const;
const FAILED_IMAGES = ["unreachable", "too-large", "not-an-image"] as const;
const named = <T extends string>(codes: readonly T[], code: string, name: (c: T) => string) =>
  (codes as readonly string[]).includes(code) ? name(code as T) : code;

const panel: React.CSSProperties = {
  margin: "0 0 24px",
  padding: "16px 20px",
  border: "1px solid var(--theme-elevation-150)",
  borderLeft: "4px solid var(--theme-success-500, #16a34a)",
  borderRadius: 4,
  background: "var(--theme-elevation-50)",
};

const collapsedKey = (id: unknown) => `trefle:import-report-collapsed:${String(id)}`;
const readCollapsed = (id: unknown) => {
  try {
    return window.localStorage.getItem(collapsedKey(id)) === "1";
  } catch {
    return false;
  }
};
const writeCollapsed = (id: unknown, collapsed: boolean) => {
  try {
    if (collapsed) window.localStorage.setItem(collapsedKey(id), "1");
    else window.localStorage.removeItem(collapsedKey(id));
  } catch {
    /* storage unavailable: the fold just isn't remembered */
  }
};

function Section({ title, items }: { title: string; items: React.ReactNode[] }) {
  if (!items.length) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <strong>{title}</strong>
      <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

const patch = async (url: string, body: unknown) => {
  const res = await fetch(url, {
    method: "PATCH",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
};

const getJson = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
};

/** 012/013: the report stored on the page import. */
async function loadPageImport(importId: unknown, t: AdminText): Promise<Loaded | null> {
  const doc = await getJson<ImportDoc>(`/api/page-imports/${String(importId)}?depth=0`);
  if (doc.reportDismissed) return null;
  const r = doc.report ?? null;
  return {
    report: r,
    penpot: false,
    collapseKey: String(doc.id),
    source: r?.finalUrl ? (
      <>
        {t("imports.report.importedFrom")}{" "}
        <a href={r.finalUrl} target="_blank" rel="noopener noreferrer">
          {r.finalUrl}
        </a>
        .
      </>
    ) : (
      // 013: a saved page without a (public) original address.
      <>{doc.sourceFileName ? t("imports.report.importedFromFile", { file: doc.sourceFileName }) : t("imports.report.importedFromSavedFile")}</>
    ),
    dismiss: () => patch(`/api/page-imports/${doc.id}`, { reportDismissed: true }),
  };
}

/** 015: this page's row of the site import. */
async function loadSiteImport(siteImportId: unknown, pageId: unknown, t: AdminText): Promise<Loaded | null> {
  const url = `/api/site-imports/${String(siteImportId)}?depth=0`;
  const doc = await getJson<SiteImportDoc>(url);
  const dismissed = (d: SiteImportDoc) => (Array.isArray(d.dismissedReports) ? (d.dismissedReports as unknown[]).map(String) : []);
  if (dismissed(doc).includes(String(pageId))) return null;
  const row = (doc.boards ?? []).find((b) => String(refId(b.page)) === String(pageId));
  return {
    report: row?.report ?? null,
    penpot: true,
    collapseKey: `site-${doc.id}-${String(pageId)}`,
    source: <>{t("imports.report.importedFromBoard", { board: row?.name ?? "?", file: doc.penpotFileName ?? doc.fileName ?? "?" })}</>,
    // Re-read first: another page of the same import may have been dismissed meanwhile.
    dismiss: async () => {
      const fresh = await getJson<SiteImportDoc>(url);
      await patch(url, { dismissedReports: [...new Set([...dismissed(fresh), String(pageId)])] });
    },
  };
}

const ImportReportPanel = () => {
  const { t, lang } = useAdminText();
  const importedFrom = useFormFields(([fields]) => fields?.importedFrom?.value) as unknown;
  const siteImport = useFormFields(([fields]) => fields?.siteImport?.value) as unknown;
  const { id: pageId } = useDocumentInfo();
  const importId = refId(importedFrom);
  const siteImportId = refId(siteImport);
  const hasImport = importId != null && importId !== "";
  const hasSiteImport = siteImportId != null && siteImportId !== "" && pageId != null;

  const [state, setState] = React.useState<
    { kind: "loading" } | { kind: "error" } | { kind: "ready"; doc: Loaded } | { kind: "hidden" }
  >({ kind: "loading" });
  const [dismissError, setDismissError] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);
  const collapseKey = state.kind === "ready" ? state.doc.collapseKey : null;

  React.useEffect(() => {
    if (collapseKey) setCollapsed(readCollapsed(collapseKey));
  }, [collapseKey]);

  const toggle = () => {
    setCollapsed((c) => {
      if (collapseKey) writeCollapsed(collapseKey, !c);
      return !c;
    });
  };

  React.useEffect(() => {
    if (!hasImport && !hasSiteImport) return;
    let ignore = false;
    setState({ kind: "loading" });
    (hasImport ? loadPageImport(importId, t) : loadSiteImport(siteImportId, pageId, t))
      .then((doc) => {
        if (!ignore) setState(doc ? { kind: "ready", doc } : { kind: "hidden" });
      })
      .catch(() => {
        if (!ignore) setState({ kind: "error" });
      });
    return () => {
      ignore = true;
    };
  }, [hasImport, hasSiteImport, importId, siteImportId, pageId]);

  const dismiss = async (doc: Loaded) => {
    if (!window.confirm(t("imports.report.dismissConfirm"))) return;
    setDismissError(false);
    try {
      await doc.dismiss();
      writeCollapsed(doc.collapseKey, false);
      setState({ kind: "hidden" });
    } catch {
      setDismissError(true);
    }
  };

  if ((!hasImport && !hasSiteImport) || state.kind === "hidden") return null;
  if (state.kind === "loading") {
    return (
      <div style={panel} aria-busy="true">
        {t("imports.report.loading")}
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div style={panel} role="alert">
        {t("imports.report.loadFailed")}
      </div>
    );
  }

  const { doc } = state;
  const r = doc.report;
  // A Penpot board has no « mobile version » to miss: the converter adapts it.
  const mobileOk = doc.penpot || r?.sourceHadMobileLayout;
  if (!r) {
    return (
      <div style={panel}>
        {t("imports.report.none")}{" "}
        <button type="button" onClick={() => void dismiss(doc)}>
          {t("imports.report.delete")}
        </button>
      </div>
    );
  }

  const blocks = Object.entries(r.reproduced.blocks)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => `${n} ${named(BLOCKS, kind, (c) => t(`imports.report.block.${c}`))}${n > 1 ? "s" : ""}`)
    .join(", ");

  const actions = r.actionsBeforePublish.length;
  const line = (l: Parameters<typeof reportLine>[0]) => reportLine(l, lang);
  const many = (n: number) => isPlural(n, lang);
  return (
    <section style={panel} aria-labelledby="import-report-title" data-testid="import-report">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "baseline", flexWrap: "wrap" }}>
        <h2 id="import-report-title" style={{ margin: 0, fontSize: 16 }}>
          {t("imports.report.title")}
          {collapsed && actions > 0 ? (
            <span style={{ fontWeight: 400 }}>
              {" "}
              — {t(many(actions) ? "imports.report.actionsMany" : "imports.report.actionsOne", { n: actions })}
            </span>
          ) : null}
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" onClick={toggle} aria-expanded={!collapsed} aria-controls="import-report-body">
            {collapsed ? t("imports.report.show") : t("imports.report.hide")}
          </button>
          <button type="button" onClick={() => void dismiss(doc)}>
            {t("imports.report.deleteReport")}
          </button>
        </div>
      </div>
      {dismissError ? (
        <p role="alert" style={{ color: "var(--theme-error-500, #b91c1c)" }}>
          {t("imports.report.deleteFailed")}
        </p>
      ) : null}
      <div id="import-report-body" hidden={collapsed}>
        <p style={{ margin: "4px 0 0" }}>{doc.source}</p>

        <Section title={t("imports.report.todo")} items={r.actionsBeforePublish.map(line)} />
        <Section
          title={t("imports.report.reproduced")}
          items={[
            `${t(many(r.reproduced.sections) ? "imports.report.sectionsMany" : "imports.report.sectionsOne", { n: r.reproduced.sections })}, ${t(
              many(r.reproduced.columns) ? "imports.report.columnGroupsMany" : "imports.report.columnGroupsOne",
              { n: r.reproduced.columns },
            )}`,
            ...(blocks ? [blocks] : []),
          ]}
        />
        <Section title={t("imports.report.simplified")} items={r.simplified.map((s) => t("imports.report.simplifiedLine", { what: line(s.what), how: line(s.how) }))} />
        <Section title={t("imports.report.omitted")} items={r.omitted.map((o) => line(o.what))} />
        <Section title={t("imports.report.unmappedFields")} items={(r.formFieldsUnmapped ?? []).map(line)} />
        <Section
          title={t("imports.report.failedImages")}
          items={r.failedImages.map(
            (f) =>
              `${f.sourceUrl.startsWith("embedded:") ? t("imports.report.embeddedImage") : f.sourceUrl} (${named(FAILED_IMAGES, f.reason, (c) => t(`imports.report.failedImage.${c}`))})`,
          )}
        />
        <Section
          title={t("imports.report.fonts")}
          items={r.fontSubstitutions.length ? [r.fontSubstitutions.join(", ")] : []}
        />
        <Section
          title={t("imports.report.accessibility")}
          items={r.accessibility.map((a) => `${named(A11Y, a.kind, (c) => t(`imports.report.a11y.${c}`))} — ${a.where}${a.detail ? ` (${a.detail})` : ""}`)}
        />
        <Section
          title={t("imports.report.screens")}
          items={[
            ...(mobileOk ? [] : [t("imports.report.noMobile")]),
            ...summariseDeviceChecks(r.deviceChecks, lang),
            ...(mobileOk && r.deviceChecks.length === 0 ? [t("imports.report.noScreenProblem")] : []),
          ]}
        />
      </div>
    </section>
  );
};

export default ImportReportPanel;
