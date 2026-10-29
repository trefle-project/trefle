"use client";

import React from "react";
import { useRouter } from "next/navigation";

import { templatesFor } from "../fields/grapesjs/starterTemplateOptions";
import type { AdminKey } from "../i18n";
import { useAdminText } from "../i18n/useAdminText";
import { formatEur, intlLocale } from "../lib/admin-locale";
import { IMPORT_ERROR_CODES, importErrorMessage, type ImportErrorCode } from "../lib/import/errors";
import { PAGE_WIZARD_STASH_KEY, type PageType, type PageWizardStash } from "./pageWizardStash";

/**
 * 004-page-types, FR-014/FR-015/FR-016/FR-018, US4 — the guided step Payload
 * lands on before the standard `pages` create form (registered as a custom
 * admin view via `admin.components.views` on Pages.ts, research.md §8).
 *
 * Collects type + template + (optional) domain/path + title, checks
 * (domain, path) for an early conflict against ANY existing page (draft or
 * published — GET /api/pages/conflict-check), then stashes the answers to
 * sessionStorage and navigates on to the real create form, where
 * `PageWizardBootstrap` applies them. This screen never creates a document
 * itself — it only primes the one, real creation that follows (spec.md
 * Clarifications: coexists with, doesn't replace, the standard form).
 *
 * 012-url-page-import (FR-001, FR-004) — the opt-in "Importer depuis une
 * page web" branch is the exception: the CMS builds the draft itself
 * (research R12), so this view starts the import, shows its progress, and
 * opens the new draft when it's done. Leaving never cancels it.
 */
type Domain = { id: string | number; hostname: string; defaultLanguage?: string | number | null };
type Budget = {
  enabled: boolean;
  available: boolean;
  blockedBy: "workspace" | "user" | null;
  resetsAt: string;
  user: { remainingEur: number };
};
type ImportState = {
  id: number;
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  step?: string | null;
  progress?: number | null;
  errorMessage?: string | null;
  errorCode?: string | null;
  page?: number | { id: number } | null;
  cancelRequested?: boolean | null;
};

// 012-url-page-import — the progress view's step labels (FR-004).
const STEP_LABELS: Record<string, AdminKey> = {
  render: "imports.stepRender",
  convert: "imports.stepConvert",
  images: "imports.stepImages",
  build: "imports.stepBuild",
  check: "imports.stepCheck",
  save: "imports.stepSave",
};

// 013-saved-page-import — a page the importer can't load (anti-bot service,
// login) can be imported from a copy saved in the editor's own browser.
const FILE_FALLBACK_CODES = new Set(["blocked", "login-required"]);
const SAVED_FILE_ACCEPT = ".html,.htm,.mhtml,.mht";
const MAX_SAVED_FILE_BYTES = 25 * 1024 * 1024;

const resetDay = (iso: string, lang: string) =>
  new Date(iso).toLocaleDateString(intlLocale(lang), { day: "numeric", month: "long", timeZone: "Europe/Paris" });
type Language = { id: string | number; code: string; label: string };

const PAGE_TYPES: { value: PageType; label: AdminKey }[] = [
  { value: "subscription", label: "pages.typeSubscription" },
  { value: "free", label: "pages.typeFree" },
  { value: "confirmation", label: "pages.typeConfirmation" },
];

function normalisePath(raw: string): string {
  const v = raw.trim();
  if (!v) return v;
  return v.startsWith("/") ? v : `/${v}`;
}

const PageCreateWizard = () => {
  const router = useRouter();
  const { t, lang } = useAdminText();

  const [pageType, setPageType] = React.useState<PageType>("subscription");
  const [templateId, setTemplateId] = React.useState(templatesFor("subscription")[0]?.id ?? "");
  const [domains, setDomains] = React.useState<Domain[]>([]);
  const [domain, setDomain] = React.useState("");
  const [languages, setLanguages] = React.useState<Language[]>([]);
  const [language, setLanguage] = React.useState("");
  // 005-content-language-tagging, US4 — tracks whether the editor picked a
  // language by hand, so a later domain change never clobbers a real choice
  // (same "don't overwrite real input" discipline as pages-starter-template.ts).
  const languageTouched = React.useRef(false);
  const [path, setPath] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  // 012-url-page-import — "Point de départ": a template (default, the 004
  // flow unchanged) or an import from a web page (opt-in, only when the
  // budget endpoint says the feature is enabled).
  const [source, setSource] = React.useState<"template" | "import">("template");
  const [importUrl, setImportUrl] = React.useState("");
  const [importInput, setImportInput] = React.useState<"url" | "file">("url");
  const [importFile, setImportFile] = React.useState<File | null>(null);
  const [budget, setBudget] = React.useState<Budget | null>(null);
  const [budgetFailed, setBudgetFailed] = React.useState(false);
  const [importState, setImportState] = React.useState<ImportState | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  React.useEffect(() => {
    // Deliberately keyed on `pageType` only — re-picks a valid templateId
    // whenever the type changes; `templateId` itself isn't a dependency,
    // it's what this effect corrects.
    const templates = templatesFor(pageType);
    if (!templates.some((tpl) => tpl.id === templateId)) setTemplateId(templates[0]?.id ?? "");
  }, [pageType]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/domains?limit=200&depth=0&sort=hostname", { credentials: "include" });
        if (!res.ok) return;
        const { docs } = (await res.json()) as { docs?: Domain[] };
        if (!cancelled) setDomains(docs ?? []);
      } catch {
        /* the select just starts empty */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/languages?where[isActive][equals]=true&limit=50&depth=0&sort=code", {
          credentials: "include",
        });
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

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/page-imports/budget", { credentials: "include" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as Budget;
        if (!cancelled) setBudget(data);
      } catch {
        if (!cancelled) setBudgetFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the running import every 2 s until it ends (contracts/import-api.md).
  const importId = importState?.id;
  const importDone = importState ? ["completed", "failed", "cancelled"].includes(importState.status) : true;
  React.useEffect(() => {
    if (importId == null || importDone) return;
    let stopped = false;
    const timer = window.setInterval(async () => {
      try {
        const res = await fetch(`/api/page-imports/${importId}?depth=0`, { credentials: "include" });
        if (!res.ok || stopped) return;
        const doc = (await res.json()) as ImportState;
        if (stopped) return;
        setImportState(doc);
        if (doc.status === "completed" && doc.page != null) {
          const pageId = typeof doc.page === "object" ? doc.page.id : doc.page;
          router.push(`/admin/collections/pages/${pageId}`);
        }
      } catch {
        /* keep polling: a blip must not end the progress view */
      }
    }, 2000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [importId, importDone, router]);

  React.useEffect(() => {
    // 005-content-language-tagging, US4/FR-006 — pre-fill from the newly
    // chosen domain's defaultLanguage, but only if the editor hasn't picked
    // a language by hand yet.
    if (languageTouched.current || !domain) return;
    const chosen = domains.find((d) => String(d.id) === domain);
    if (chosen?.defaultLanguage != null) setLanguage(String(chosen.defaultLanguage));
  }, [domain, domains]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const normalisedPath = normalisePath(path);

    if (domain && normalisedPath) {
      setChecking(true);
      try {
        const res = await fetch(
          `/api/pages/conflict-check?domain=${encodeURIComponent(domain)}&path=${encodeURIComponent(normalisedPath)}`,
          { credentials: "include" },
        );
        if (res.ok) {
          const data = (await res.json()) as { conflict: boolean; pageTitle?: string };
          if (data.conflict) {
            setError(t("pages.conflict", { title: data.pageTitle ?? t("pages.anotherPage") }));
            setChecking(false);
            return;
          }
        }
      } catch {
        // Advisory check only (research.md §10) — a network failure here
        // must not block the wizard; the publish guard is the real gate.
      }
      setChecking(false);
    }

    if (source === "import") {
      const fields = {
        pageType,
        title,
        domain: domain || undefined,
        path: normalisedPath || undefined,
        language: language || undefined,
      };
      let body: BodyInit;
      const headers: Record<string, string> = {};
      if (importInput === "file") {
        // Checked here for an instant answer, and again by the server.
        if (!importFile) return setError(t("imports.chooseFile"));
        if (importFile.size > MAX_SAVED_FILE_BYTES) return setError(t("imports.fileTooLarge"));
        if (!/\.(html?|mht|mhtml)$/i.test(importFile.name)) return setError(t("imports.fileUnsupported"));
        const form = new FormData();
        form.append("_payload", JSON.stringify(fields));
        form.append("file", importFile);
        body = form;
      } else {
        headers["content-type"] = "application/json";
        body = JSON.stringify({ url: importUrl.trim(), ...fields });
      }
      setChecking(true);
      try {
        const res = await fetch("/api/page-imports/start", { method: "POST", credentials: "include", headers, body });
        const data = (await res.json().catch(() => ({}))) as {
          id?: number;
          status?: ImportState["status"];
          errors?: { message?: string }[];
        };
        if (res.status === 202 && data.id != null) {
          setImportState({ id: data.id, status: data.status ?? "queued" });
        } else {
          setError(data.errors?.[0]?.message ?? t("imports.startFailed"));
        }
      } catch {
        setError(t("imports.startInterrupted"));
      }
      setChecking(false);
      return;
    }

    const stash: PageWizardStash = {
      pageType,
      templateId,
      domain: domain || undefined,
      path: normalisedPath || undefined,
      title,
      language: language || undefined,
    };
    try {
      window.sessionStorage.setItem(PAGE_WIZARD_STASH_KEY, JSON.stringify(stash));
    } catch {
      /* sessionStorage unavailable (private mode etc.) — proceed anyway,
       * the bootstrap will just find nothing to apply. */
    }
    router.push("/admin/collections/pages/create");
  };

  const cancelImport = async () => {
    if (!importState) return;
    setCancelling(true);
    try {
      await fetch(`/api/page-imports/${importState.id}/cancel`, { method: "POST", credentials: "include" });
    } catch {
      /* the next poll shows whether it took */
    }
  };

  if (importState) {
    const { status } = importState;
    const running = status === "queued" || status === "running";
    return (
      <div style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
        <h1 style={{ fontSize: 20, marginBottom: 16 }}>{t("imports.progressTitle")}</h1>
        {running || status === "completed" ? (
          <div aria-live="polite">
            <p style={{ marginBottom: 8 }}>
              {status === "completed"
                ? t("imports.completedOpening")
                : status === "queued"
                  ? t("imports.waitingStart")
                  : `${t(STEP_LABELS[importState.step ?? ""] ?? "imports.inProgress")}…`}
            </p>
            <progress
              max={100}
              value={importState.progress ?? 0}
              aria-label={t("imports.progressLabel")}
              style={{ width: "100%", height: 12 }}
            />
            {running ? (
              <>
                <p style={{ fontSize: 13, marginTop: 12 }}>
                  {t("imports.canLeave")} <a href="/admin/collections/page-imports">{t("imports.pageImports")}</a>.
                </p>
                <button type="button" onClick={() => void cancelImport()} disabled={cancelling || !!importState.cancelRequested}>
                  {cancelling || importState.cancelRequested ? t("imports.cancelling") : t("common.cancel")}
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <div>
            <p role="alert" style={{ marginBottom: 16 }}>
              {status === "cancelled"
                ? t("imports.cancelledNoPage")
                : // The stored text is French (the job's); the code gives the member's language.
                  (IMPORT_ERROR_CODES.includes(importState.errorCode as ImportErrorCode)
                    ? importErrorMessage(importState.errorCode as ImportErrorCode, lang)
                    : importState.errorMessage) ?? t("imports.failedNoPage")}
            </p>
            {status === "failed" && FILE_FALLBACK_CODES.has(importState.errorCode ?? "") ? (
              <>
                <p style={{ fontSize: 13, marginBottom: 12 }}>{t("imports.saveHelp")}</p>
                <button
                  type="button"
                  style={{ marginRight: 8 }}
                  onClick={() => {
                    setImportState(null);
                    setCancelling(false);
                    setImportInput("file");
                  }}
                >
                  {t("imports.importSaved")}
                </button>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setImportState(null);
                setCancelling(false);
              }}
            >
              {t("common.retry")}
            </button>
          </div>
        )}
      </div>
    );
  }

  const importOffered = budget?.enabled === true;
  const importBlockedNotice =
    budget && budget.enabled && !budget.available
      ? budget.blockedBy === "user"
        ? t("imports.userBudgetOut", { date: resetDay(budget.resetsAt, lang) })
        : t("imports.workspaceBudgetOut", { date: resetDay(budget.resetsAt, lang) })
      : null;

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>{t("pages.wizardTitle")}</h1>
      <form onSubmit={handleSubmit}>
        {importOffered ? (
          <fieldset style={{ marginBottom: 16, border: "none", padding: 0 }}>
            <legend style={{ marginBottom: 4, fontSize: 13 }}>{t("pages.startingPoint")}</legend>
            <label style={{ display: "block", marginBottom: 4 }}>
              <input
                type="radio"
                name="wizard-source"
                value="template"
                checked={source === "template"}
                onChange={() => setSource("template")}
              />{" "}
              {t("pages.template")}
            </label>
            <label style={{ display: "block" }}>
              <input
                type="radio"
                name="wizard-source"
                value="import"
                checked={source === "import"}
                disabled={!budget.available}
                onChange={() => setSource("import")}
              />{" "}
              {t("pages.importFromWeb")}
              {budget.available ? t("pages.budgetLeft", { amount: formatEur(budget.user.remainingEur, lang) }) : ""}
            </label>
            {importBlockedNotice ? (
              <p role="status" style={{ fontSize: 13, marginTop: 4 }}>
                {importBlockedNotice}
              </p>
            ) : null}
          </fieldset>
        ) : budgetFailed ? (
          <p style={{ fontSize: 13, marginBottom: 16 }}>
            {t("pages.importUnavailable")}
          </p>
        ) : null}

        {source === "import" && importInput === "url" ? (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="wizard-url" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              {t("pages.importUrl")}
            </label>
            <input
              id="wizard-url"
              type="url"
              required
              placeholder="https://"
              value={importUrl}
              onChange={(e) => setImportUrl(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
            <button
              type="button"
              onClick={() => setImportInput("file")}
              style={{ marginTop: 4, padding: 0, border: "none", background: "none", textDecoration: "underline", fontSize: 12, cursor: "pointer" }}
            >
              {t("pages.alreadySaved")}
            </button>
          </div>
        ) : null}
        {source === "import" && importInput === "file" ? (
          <div style={{ marginBottom: 16 }}>
            <label htmlFor="wizard-file" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
              {t("pages.savedFileLabel")}
            </label>
            <input
              id="wizard-file"
              type="file"
              required
              accept={SAVED_FILE_ACCEPT}
              onChange={(e) => {
                setError(null);
                setImportFile(e.target.files?.[0] ?? null);
              }}
              style={{ width: "100%" }}
            />
            <p style={{ fontSize: 12, margin: "4px 0" }}>{t("imports.saveHelp")}</p>
            <button
              type="button"
              onClick={() => setImportInput("url")}
              style={{ padding: 0, border: "none", background: "none", textDecoration: "underline", fontSize: 12, cursor: "pointer" }}
            >
              {t("pages.importFromUrl")}
            </button>
          </div>
        ) : null}

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="wizard-title" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {t("pages.title")}
          </label>
          <input
            id="wizard-title"
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="wizard-type" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {t("pages.pageType")}
          </label>
          <select
            id="wizard-type"
            value={pageType}
            onChange={(e) => setPageType(e.target.value as PageType)}
            style={{ width: "100%", padding: 8 }}
          >
            {PAGE_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {t(p.label)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16, display: source === "import" ? "none" : undefined }}>
          <label htmlFor="wizard-template" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {t("pages.template")}
          </label>
          <select
            id="wizard-template"
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            {templatesFor(pageType).map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.label[lang]}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="wizard-language" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {t("pages.language")}
          </label>
          <select
            id="wizard-language"
            required
            value={language}
            onChange={(e) => {
              languageTouched.current = true;
              setLanguage(e.target.value);
            }}
            style={{ width: "100%", padding: 8 }}
          >
            <option value="">{t("pages.choose")}</option>
            {languages.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="wizard-domain" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {t("pages.domainOptional")}
          </label>
          <select
            id="wizard-domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          >
            <option value="">{t("pages.none")}</option>
            {domains.map((d) => (
              <option key={d.id} value={String(d.id)}>
                {d.hostname}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="wizard-path" style={{ display: "block", marginBottom: 4, fontSize: 13 }}>
            {t("pages.pathOptional")}
          </label>
          <input
            id="wizard-path"
            type="text"
            disabled={!domain}
            value={path}
            onChange={(e) => setPath(e.target.value)}
            style={{ width: "100%", padding: 8 }}
          />
        </div>

        {error ? (
          <p role="alert" style={{ color: "var(--theme-error-500, #b91c1c)", fontSize: 13, marginBottom: 16 }}>
            {error}
          </p>
        ) : null}

        <button type="submit" disabled={checking} style={{ padding: "8px 16px" }}>
          {checking ? t("pages.checking") : source === "import" ? t("pages.import") : t("pages.continue")}
        </button>
      </form>
    </div>
  );
};

export default PageCreateWizard;
