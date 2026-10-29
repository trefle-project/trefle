"use client";

import React from "react";
import { useSearchParams } from "next/navigation";

import type { AdminKey, AdminText } from "../i18n";
import { useAdminText } from "../i18n/useAdminText";
import { isPlural } from "../lib/admin-locale";
import { MAX_BOARDS_PER_IMPORT, SITE_IMPORT_ERROR_CODES, siteImportErrorMessage, type SiteImportErrorCode } from "../lib/import/site-errors";

/**
 * 015-penpot-site-import (T029, contracts/site-import-api.md « Admin UI
 * entry ») — « Importer un site Penpot », a custom admin view registered on
 * Pages.ts (`/admin/collections/pages/import-penpot`). Four steps:
 *
 * 1. Domaine — chosen first (FR-001): the analysis marks the addresses
 *    already published on it, and it cannot change afterwards.
 * 2. Fichier — the `.penpot` export, analysed by the server.
 * 3. Pages — the Penpot page, the boards to import (10 at most) and their
 *    addresses, the language.
 * 4. Import — progress, « Annuler », then the drafts created.
 *
 * Leaving the page never cancels a running import.
 */
type Domain = { id: number; hostname: string; label?: string | null; isActive?: boolean; defaultLanguage?: number | null };
type Language = { id: number; code: string; label: string };
type Board = { id: string; name: string; width: number; height: number; proposedPath: string; published?: boolean; thumbnail?: string };
type PenpotPage = { id: string; name: string; boards: Board[] };
type Analysis = {
  id: number;
  domain: { id: number; hostname: string; defaultLanguage: number | null };
  publishedPaths: string[];
  penpotFileName: string;
  pages: PenpotPage[];
};
type Row = { checked: boolean; path: string };
type ImportState = {
  id: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | "analysed" | "abandoned";
  step?: string | null;
  progress?: number | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  cancelRequested?: boolean | null;
  boards?: { name: string; path: string; page?: number | { id: number } | null }[] | null;
};

// Same cap as the server (siteImportAnalyse.ts, 017 research R13).
const MAX_FILE_BYTES = 95 * 1024 * 1024;
const STEP_LABELS: Record<string, AdminKey> = {
  parse: "imports.siteStepParse",
  fonts: "imports.siteStepFonts",
  images: "imports.siteStepImages",
  build: "imports.siteStepBuild",
  check: "imports.stepCheck",
  save: "imports.siteStepSave",
};
const STEPS = ["imports.stepDomain", "imports.stepFile", "imports.stepPages", "imports.stepImport"] as const;

const wrap = { maxWidth: 880, margin: "40px auto", padding: "0 16px" } as const;
const labelStyle = { display: "block", marginBottom: 4, fontSize: 13 } as const;
const field = { width: "100%", padding: 8 } as const;
const errorStyle = { color: "var(--theme-error-500, #b91c1c)", fontSize: 13 } as const;
const linkButton = { padding: 0, border: "none", background: "none", textDecoration: "underline", fontSize: 13, cursor: "pointer" } as const;

const domainName = (d: Domain) => (d.label && d.label !== d.hostname ? `${d.label} — ${d.hostname}` : d.hostname);
const normalisePath = (raw: string) => {
  const v = raw.trim();
  return v.startsWith("/") ? v : `/${v}`;
};
const idOf = (v: number | { id: number } | null | undefined) => (v && typeof v === "object" ? v.id : v);

/** Problem with one ticked address, or null (same rules as the start endpoint). */
function pathProblem(path: string, others: string[], t: AdminText): string | null {
  if (!path.trim()) return t("imports.pathEmpty");
  const p = normalisePath(path);
  if (/[\s?#]/.test(p)) {
    const chars = t("imports.pathChars");
    return chars.charAt(0).toUpperCase() + chars.slice(1);
  }
  if (p.replace(/\/+$/, "") === "/confirmation") return t("imports.pathConfirmation");
  if (others.includes(p)) return t("imports.pathTaken");
  return null;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { errors?: { message?: string }[] };
  return data.errors?.[0]?.message ?? fallback;
}

const Stepper = ({ current }: { current: number }) => {
  const { t } = useAdminText();
  return (
    <ol aria-label={t("imports.stepsLabel")} style={{ display: "flex", gap: 16, listStyle: "none", padding: 0, margin: "0 0 24px", fontSize: 13 }}>
      {STEPS.map((s, i) => (
        <li key={s} aria-current={i === current ? "step" : undefined} style={{ fontWeight: i === current ? 700 : 400, opacity: i > current ? 0.6 : 1 }}>
          {i + 1}. {t(s)}
        </li>
      ))}
    </ol>
  );
};

const SiteImportWizard = () => {
  const search = useSearchParams();
  const { t, lang } = useAdminText();
  const askedDomain = search?.get("domain") ?? null;

  const [step, setStep] = React.useState(0);
  const [domains, setDomains] = React.useState<Domain[] | null>(null);
  const [domainsFailed, setDomainsFailed] = React.useState(false);
  const [domainId, setDomainId] = React.useState("");
  const [languages, setLanguages] = React.useState<Language[]>([]);
  const [language, setLanguage] = React.useState("");

  const [analysing, setAnalysing] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [pageId, setPageId] = React.useState("");
  const [rows, setRows] = React.useState<Record<string, Row>>({});

  const [error, setError] = React.useState<string | null>(null);
  const [starting, setStarting] = React.useState(false);
  const [importState, setImportState] = React.useState<ImportState | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  // Active domains; `?domain=` (from a domain's page) chooses one and opens the file step.
  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/domains?where[isActive][equals]=true&limit=200&depth=0&sort=hostname", { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const { docs } = (await res.json()) as { docs?: Domain[] };
        if (cancelled) return;
        const list = docs ?? [];
        setDomains(list);
        const asked = askedDomain ? list.find((d) => String(d.id) === askedDomain) : undefined;
        if (asked) {
          setDomainId(String(asked.id));
          setStep(1);
        } else if (list.length === 1) setDomainId(String(list[0]!.id));
      } catch {
        if (!cancelled) setDomainsFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [askedDomain]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/languages?where[isActive][equals]=true&limit=50&depth=0&sort=code", { credentials: "include" });
        if (!res.ok) return;
        const { docs } = (await res.json()) as { docs?: Language[] };
        if (!cancelled) setLanguages(docs ?? []);
      } catch {
        /* the select just starts empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const domain = domains?.find((d) => String(d.id) === domainId);
  const page = analysis?.pages.find((p) => p.id === pageId);

  const choosePage = (a: Analysis, id: string) => {
    setPageId(id);
    const p = a.pages.find((x) => x.id === id);
    setRows(Object.fromEntries((p?.boards ?? []).map((b, i) => [b.id, { checked: i < MAX_BOARDS_PER_IMPORT, path: b.proposedPath }])));
  };

  const resetAnalysis = () => {
    setAnalysis(null);
    setPageId("");
    setRows({});
    setError(null);
  };

  const analyse = async (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!/\.penpot$/i.test(file.name)) return setError(t("imports.siteNotPenpot"));
    if (file.size > MAX_FILE_BYTES) return setError(t("imports.siteFileTooLarge"));
    setAnalysing(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/site-imports/analyse?domain=${encodeURIComponent(domainId)}`, {
        method: "POST",
        credentials: "include",
        body: form,
      });
      if (res.status !== 201) {
        setError(await errorMessage(res, t("imports.analyseFailed")));
        return;
      }
      const a = (await res.json()) as Analysis;
      setAnalysis(a);
      choosePage(a, (a.pages.find((p) => p.boards.length) ?? a.pages[0])?.id ?? "");
      if (!language && a.domain.defaultLanguage != null) setLanguage(String(a.domain.defaultLanguage));
      setStep(2);
    } catch {
      setError(t("imports.uploadInterrupted"));
    } finally {
      setAnalysing(false);
    }
  };

  // Ticked rows, their addresses and problems, recomputed on each keystroke.
  const ticked = (page?.boards ?? []).filter((b) => rows[b.id]?.checked);
  const tickedPaths = ticked.map((b) => normalisePath(rows[b.id]!.path));
  const problems = Object.fromEntries(
    ticked.map((b, i) => [b.id, pathProblem(rows[b.id]!.path, tickedPaths.filter((_, j) => j !== i), t)]),
  );
  const canStart = ticked.length > 0 && !Object.values(problems).some(Boolean) && Boolean(language) && !starting;

  const toggle = (id: string, checked: boolean) => {
    setError(null);
    if (checked && ticked.length >= MAX_BOARDS_PER_IMPORT) return setError(t("imports.tooManyBoards"));
    setRows((r) => ({ ...r, [id]: { ...r[id]!, checked } }));
  };

  const start = async () => {
    if (!analysis || !canStart) return;
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/site-imports/${analysis.id}/start`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          penpotPageId: pageId,
          language: Number(language),
          boards: ticked.map((b) => ({ id: b.id, path: normalisePath(rows[b.id]!.path) })),
        }),
      });
      if (res.status === 202) {
        setImportState({ id: analysis.id, status: "queued" });
        setStep(3);
      } else {
        setError(await errorMessage(res, t("imports.startFailed")));
      }
    } catch {
      setError(t("imports.startInterrupted"));
    } finally {
      setStarting(false);
    }
  };

  // Poll the running import every 2 s until it ends (contract « GET /api/site-imports/:id »).
  const importId = importState?.id;
  const importDone = importState ? !["queued", "running"].includes(importState.status) : true;
  React.useEffect(() => {
    if (importId == null || importDone) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/site-imports/${importId}?depth=0`, { credentials: "include" });
        if (!res.ok || stopped) return;
        const doc = (await res.json()) as ImportState;
        if (!stopped) setImportState(doc);
      } catch {
        /* keep polling: a blip must not end the progress view */
      }
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [importId, importDone]);

  const cancelImport = async () => {
    if (!importState) return;
    setCancelling(true);
    try {
      await fetch(`/api/site-imports/${importState.id}/cancel`, { method: "POST", credentials: "include" });
    } catch {
      /* the next poll shows whether it took */
    }
  };

  // The stored text is French (the job's, naming the board for page-too-large);
  // the code gives the member's language.
  const storedError = (s: ImportState) =>
    SITE_IMPORT_ERROR_CODES.includes(s.errorCode as SiteImportErrorCode) && !(lang === "fr" && s.errorMessage)
      ? siteImportErrorMessage(s.errorCode as SiteImportErrorCode, lang)
      : s.errorMessage;

  const restart = () => {
    setImportState(null);
    setCancelling(false);
    resetAnalysis();
    setStep(1);
  };

  // ------------------------------------------------------------ 4. Import
  if (step === 3 && importState) {
    const { status } = importState;
    const running = status === "queued" || status === "running";
    const created = (importState.boards ?? []).filter((b) => idOf(b.page) != null);
    return (
      <div style={wrap}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>{t("imports.siteTitle")}</h1>
        <Stepper current={3} />
        {running ? (
          <div aria-live="polite">
            <p style={{ marginBottom: 8 }}>
              {status === "queued" ? t("imports.waitingStart") : `${t(STEP_LABELS[importState.step ?? ""] ?? "imports.inProgress")}…`}
            </p>
            <progress max={100} value={importState.progress ?? 0} aria-label={t("imports.progressLabel")} style={{ width: "100%", height: 12 }} />
            <p style={{ fontSize: 13, marginTop: 12 }}>
              {t("imports.canLeave")} <a href="/admin/collections/site-imports">{t("imports.sitePenpotImports")}</a>.
            </p>
            <button type="button" onClick={() => void cancelImport()} disabled={cancelling || !!importState.cancelRequested}>
              {cancelling || importState.cancelRequested ? t("imports.cancelling") : t("common.cancel")}
            </button>
          </div>
        ) : status === "completed" ? (
          <div aria-live="polite">
            <p style={{ marginBottom: 12 }}>
              {t(isPlural(created.length, lang) ? "imports.siteCompletedMany" : "imports.siteCompletedOne", { n: created.length })}
            </p>
            <ul style={{ marginBottom: 16 }}>
              {created.map((b) => (
                <li key={String(idOf(b.page))}>
                  <a href={`/admin/collections/pages/${idOf(b.page)}`}>{b.name}</a> <span style={{ opacity: 0.7 }}>({b.path})</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={restart}>
              {t("imports.importAnother")}
            </button>
          </div>
        ) : (
          <div>
            <p role="alert" style={{ marginBottom: 16 }}>
              {status === "cancelled"
                ? t("imports.cancelledNoPage")
                : (storedError(importState) ?? t("imports.failedNoPage"))}
            </p>
            <button type="button" onClick={restart}>
              {t("common.retry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={wrap}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>{t("imports.siteTitle")}</h1>
      <Stepper current={step} />

      {/* ------------------------------------------------------ 1. Domaine */}
      {step === 0 ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (domainId) setStep(1);
          }}
          style={{ maxWidth: 480 }}
        >
          {domains === null && !domainsFailed ? <p>{t("imports.loadingDomains")}</p> : null}
          {domainsFailed ? (
            <p role="alert" style={errorStyle}>
              {t("imports.domainsFailed")}
            </p>
          ) : null}
          {domains && !domains.length ? (
            <p role="status">
              {t("imports.noActiveDomain")} <a href="/admin/collections/domains/create">{t("imports.createDomain")}</a>
              {t("imports.noActiveDomainEnd")}
            </p>
          ) : null}
          {domains?.length ? (
            <>
              <label htmlFor="site-import-domain" style={labelStyle}>
                {t("imports.siteDomain")}
              </label>
              <select id="site-import-domain" required value={domainId} onChange={(e) => setDomainId(e.target.value)} style={field}>
                <option value="">{t("pages.choose")}</option>
                {domains.map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {domainName(d)}
                  </option>
                ))}
              </select>
              <p style={{ fontSize: 12, margin: "4px 0 16px" }}>
                {t("imports.domainLocked")}
              </p>
              <button type="submit" disabled={!domainId} style={{ padding: "8px 16px" }}>
                {t("pages.continue")}
              </button>
            </>
          ) : null}
        </form>
      ) : null}

      {/* ------------------------------------------------------ 2. Fichier */}
      {step === 1 ? (
        <div style={{ maxWidth: 560 }}>
          <p style={{ marginBottom: 12 }}>
            {t("imports.siteFor")} <strong>{domain?.hostname ?? "…"}</strong>{" "}
            <button
              type="button"
              style={linkButton}
              onClick={() => {
                resetAnalysis();
                setStep(0);
              }}
            >
              {t("imports.changeDomain")}
            </button>
          </p>
          <label
            htmlFor="site-import-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!analysing) void analyse(e.dataTransfer.files?.[0]);
            }}
            style={{
              position: "relative",
              display: "block",
              padding: "32px 16px",
              border: `2px dashed var(--theme-elevation-${dragging ? "500" : "250"})`,
              borderRadius: 6,
              textAlign: "center",
              cursor: analysing ? "progress" : "pointer",
            }}
          >
            {analysing ? (
              <span aria-live="polite">{t("imports.analysingFile")}</span>
            ) : (
              <>
                <strong>{t("imports.dropFile")}</strong>
                <br />
                <span style={{ fontSize: 13 }}>{t("imports.orClick")}</span>
              </>
            )}
            <input
              id="site-import-file"
              type="file"
              accept=".penpot"
              disabled={analysing}
              onChange={(e) => {
                void analyse(e.target.files?.[0]);
                e.target.value = "";
              }}
              style={{ position: "absolute", width: 1, height: 1, opacity: 0 }}
            />
          </label>
          <p style={{ fontSize: 12, marginTop: 8 }}>
            {t("imports.penpotHelp")}
          </p>
          {error ? (
            <p role="alert" style={{ ...errorStyle, marginTop: 12 }}>
              {error}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ------------------------------------------------------ 3. Pages */}
      {step === 2 && analysis ? (
        <div>
          <p style={{ marginBottom: 12 }}>
            {t("imports.fileFor", { file: analysis.penpotFileName })} <strong>{analysis.domain.hostname}</strong>{" "}
            <button
              type="button"
              style={linkButton}
              onClick={() => {
                resetAnalysis();
                setStep(1);
              }}
            >
              {t("imports.changeFile")}
            </button>
          </p>

          {analysis.pages.length > 1 ? (
            <div style={{ marginBottom: 16, maxWidth: 480 }}>
              <label htmlFor="site-import-page" style={labelStyle}>
                {t("imports.penpotPage")}
              </label>
              <select id="site-import-page" value={pageId} onChange={(e) => choosePage(analysis, e.target.value)} style={field}>
                {analysis.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {t(isPlural(p.boards.length, lang) ? "imports.boardsMany" : "imports.boardsOne", { name: p.name, n: p.boards.length })}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {!page?.boards.length ? (
            <p role="status" style={{ marginBottom: 16 }}>
              {t("imports.noBoard")}
            </p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16, fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: "left" }}>
                  <th style={{ padding: 4 }}>
                    <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
                      {t("pages.import")}
                    </span>
                  </th>
                  <th style={{ padding: 4 }}>{t("imports.colPreview")}</th>
                  <th style={{ padding: 4 }}>{t("imports.colBoard")}</th>
                  <th style={{ padding: 4 }}>{t("imports.colAddress")}</th>
                </tr>
              </thead>
              <tbody>
                {page.boards.map((b) => {
                  const row = rows[b.id] ?? { checked: false, path: b.proposedPath };
                  const problem = row.checked ? problems[b.id] : null;
                  const published = analysis.publishedPaths.includes(normalisePath(row.path));
                  const inputId = `site-import-path-${b.id}`;
                  return (
                    <tr key={b.id} style={{ borderTop: "1px solid var(--theme-elevation-150)", verticalAlign: "top" }}>
                      <td style={{ padding: 4 }}>
                        <input
                          type="checkbox"
                          aria-label={t("imports.importBoard", { name: b.name })}
                          checked={row.checked}
                          onChange={(e) => toggle(b.id, e.target.checked)}
                        />
                      </td>
                      <td style={{ padding: 4, width: 120 }}>
                        {b.thumbnail ? (
                          <img src={b.thumbnail} alt="" style={{ width: 112, height: "auto", border: "1px solid var(--theme-elevation-150)" }} />
                        ) : (
                          <span style={{ opacity: 0.7 }}>
                            {Math.round(b.width)} × {Math.round(b.height)}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: 4 }}>{b.name}</td>
                      <td style={{ padding: 4 }}>
                        <label htmlFor={inputId} style={{ position: "absolute", width: 1, height: 1, overflow: "hidden" }}>
                          {t("imports.boardAddress", { name: b.name })}
                        </label>
                        <input
                          id={inputId}
                          type="text"
                          value={row.path}
                          disabled={!row.checked}
                          aria-invalid={problem ? true : undefined}
                          aria-describedby={problem || published ? `${inputId}-note` : undefined}
                          onChange={(e) => {
                            const path = e.target.value;
                            setRows((r) => ({ ...r, [b.id]: { ...row, path } }));
                          }}
                          style={{ width: "100%", padding: 6 }}
                        />
                        {problem ? (
                          <p id={`${inputId}-note`} style={{ ...errorStyle, margin: "2px 0 0" }}>
                            {problem}
                          </p>
                        ) : published && row.checked ? (
                          <p id={`${inputId}-note`} style={{ fontSize: 12, margin: "2px 0 0" }}>
                            {t("imports.alreadyPublished")}
                          </p>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <div style={{ marginBottom: 16, maxWidth: 480 }}>
            <label htmlFor="site-import-language" style={labelStyle}>
              {t("imports.pagesLanguage")}
            </label>
            <select id="site-import-language" required value={language} onChange={(e) => setLanguage(e.target.value)} style={field}>
              <option value="">{t("pages.choose")}</option>
              {languages.map((l) => (
                <option key={l.id} value={String(l.id)}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>

          {error ? (
            <p role="alert" style={{ ...errorStyle, marginBottom: 12 }}>
              {error}
            </p>
          ) : null}

          <button type="button" onClick={() => void start()} disabled={!canStart} style={{ padding: "8px 16px" }}>
            {starting ? t("imports.starting") : t(isPlural(ticked.length, lang) ? "imports.importNMany" : "imports.importNOne", { n: ticked.length })}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default SiteImportWizard;
