"use client";

import type { Component as GjsComponent, Editor as GjsEditor } from "grapesjs";
import type { JSONFieldClientComponent } from "payload";

import { useAuth, useField, useForm, useFormFields } from "@payloadcms/ui";
import { genericFamily } from "@trefle/grapesjs-page-import/penpot";
import { fontFaceCss, type FontFile } from "@trefle/shared";
import React from "react";

import "grapesjs/dist/css/grapes.min.css";
import "./editor.css";
import { CAROUSEL_TYPES } from "@trefle/grapesjs-page-import/carousel";
import { CAROUSEL_LABELS_FR, trefleLayoutPlugin } from "@trefle/grapesjs-page-import/plugin";
import type { AdminKey } from "../../i18n";
import { useAdminText } from "../../i18n/useAdminText";
import { GJS_BLOCKS } from "./blocks";
import { promoteEditableTexts } from "./editableTexts";
import { applyMediaAliases, fetchMediaAliases } from "./mediaAliases";
import { registerCodeView } from "./codeView";
import { registerCustomCode, type CustomCodeHooks, type CustomCodeRow } from "./customCodeBlock";
import { exportHtml } from "./exportHtml";

/**
 * GrapesJS block editor (T031) — bound to `builder.projectData`.
 * On every change it also writes `builder.html` / `builder.css` (the only things
 * the renderer consumes).
 *
 * Images go through the Media collection (S3/MinIO) and are referenced by URL —
 * never inlined as base64. A data: URI would be persisted three times
 * (projectData + html + css) and quickly push the document past the body-size
 * limits, which is what broke page saves before.
 *
 * 014-custom-code-editing adds, for every editor, the « Code » view (HTML/CSS
 * as code, codeView.ts) and, for admins only, the « Code personnalisé » block
 * (customCodeBlock.ts), whose code lives in the page's admin-only
 * `customCode.blocks` rows — never in the canvas or the page HTML. The
 * lead-form and custom-code placeholders are component types, so HTML
 * re-parsed from the « Code » view keeps them.
 *
 * NOTE: needs a browser to run; verified visually in Phase 3b / manual QA and
 * by the e2e suite (us14-custom-code.spec.ts). The server-side block
 * counting + publish guard work off `projectData` regardless of how it was
 * produced.
 */
type MediaDoc = { id: string | number; url?: string; filename?: string; mimeType?: string };

// Cap editor image uploads well under the document body limits — a landing page
// only needs web-optimised images. Enforced again server-side is out of scope
// here; this is the immediate, friendly feedback on file choice.
const MAX_IMAGE_BYTES = 500 * 1024;

const uploadEventFiles = (e: unknown): File[] => {
  const ev = e as { dataTransfer?: { files?: FileList }; target?: { files?: FileList } };
  const list = ev.dataTransfer?.files ?? ev.target?.files;
  return list ? Array.from(list) : [];
};

// Dropping the "Formulaire (lead)" block seeds a required email field into
// `form.fields` (the real fields live there, not in GrapesJS) when the page
// doesn't have one yet — the publish guard requires exactly one email field.
const LEAD_FORM_BLOCK_ID = "lead-form";
const gjsBlockId = (block: unknown): unknown =>
  (block as { get?: (k: string) => unknown; id?: unknown } | undefined)?.get?.("id") ??
  (block as { id?: unknown } | undefined)?.id;
const cell = (v: string | boolean) => ({ value: v, initialValue: v, valid: true });

// 014-custom-code-editing (FR-010) — the lead-form placeholder as a real
// component type, recognised by its marker. Pages saved as projectData keep
// the block's own `droppable`/`editable` flags, but HTML re-parsed from the
// « Code » view (or any HTML import) would otherwise come back as a plain,
// droppable, editable div — letting blocks be nested in the form slot.
// 016-carousel-block (FR-007) — never inside a carousel slide, however deep:
// the form must stay visible without interaction (the publish guard enforces it).
const inCarouselSlide = (target: GjsComponent) =>
  target.is(CAROUSEL_TYPES.slide) || Boolean(target.closestType(CAROUSEL_TYPES.slide));
const leadFormType = (editor: GjsEditor) => {
  if (editor.Components.getType(LEAD_FORM_BLOCK_ID)) return; // hot reload
  editor.Components.addType(LEAD_FORM_BLOCK_ID, {
    isComponent: (el: HTMLElement) =>
      typeof el.getAttribute === "function" && el.getAttribute("data-block") === LEAD_FORM_BLOCK_ID,
    model: {
      defaults: {
        name: "Formulaire (lead)",
        droppable: false,
        editable: false,
        draggable: (_self: GjsComponent, target: GjsComponent) => !inCarouselSlide(target),
      },
    },
  });
};

type GjsWithStyles = {
  StyleManager?: {
    getProperty: (
      sector: string,
      id: string,
    ) => { getOptions: () => { id: string; label: string }[]; setOptions: (o: { id: string; label: string }[]) => unknown } | undefined;
  };
  Canvas: { getDocument: () => Document | null };
};

/**
 * 015-penpot-site-import, FR-027 — the page's domain fonts in the editor:
 * offered first in the font list (same `"Family", generic` value the Penpot
 * import writes, so imported texts show their font as selected) and loaded
 * in the canvas with the very @font-face rules the published page gets.
 */
async function applyDomainFonts(editor: GjsWithStyles, domainId: unknown, defaults: { id: string; label: string }[]): Promise<void> {
  let files: FontFile[] = [];
  if (domainId != null && domainId !== "") {
    try {
      const res = await fetch(`/api/domains/${encodeURIComponent(String(domainId))}?depth=1`, { credentials: "include" });
      const domain = res.ok ? ((await res.json()) as { fonts?: { files?: unknown[] }[] }) : {};
      files = (domain.fonts ?? []).flatMap((row) =>
        (row.files ?? []).filter((f): f is FontFile => Boolean(f && typeof f === "object" && (f as FontFile).url && (f as FontFile).family)),
      );
    } catch {
      files = [];
    }
  }
  const families = [...new Set(files.map((f) => f.family))];
  const prop = editor.StyleManager?.getProperty("typography", "font-family");
  prop?.setOptions([...families.map((f) => ({ id: `"${f}", ${genericFamily(f)}`, label: f })), ...defaults]);
  const doc = editor.Canvas.getDocument();
  if (!doc) return;
  let style = doc.getElementById("trefle-domain-fonts");
  if (!style) {
    style = doc.createElement("style");
    style.id = "trefle-domain-fonts";
    doc.head.appendChild(style);
  }
  style.textContent = fontFaceCss(files);
}

const GrapesEditor: JSONFieldClientComponent = (props) => {
  const path = props.path ?? "builder.projectData";
  const { value, setValue } = useField<Record<string, unknown>>({ path });
  const html = useField<string>({ path: "builder.html" });
  const css = useField<string>({ path: "builder.css" });

  const { addFieldRow, getDataByPath, dispatchFields, setModified } = useForm();
  // 015 — the page's domain, to load its fonts (re-applied when it changes).
  const domainId = useFormFields(([fields]) => fields?.domain?.value);
  const domainIdRef = React.useRef<unknown>(domainId);
  domainIdRef.current = domainId;
  const defaultFontsRef = React.useRef<{ id: string; label: string }[] | null>(null);
  const formApi = React.useRef({ addFieldRow, getDataByPath });
  formApi.current = { addFieldRow, getDataByPath };

  // 014-custom-code-editing, US3 — the « Code personnalisé » block reads and
  // writes its code in the page's admin-only `customCode.blocks` rows. The
  // role is read once at mount (the editor is built once); for editors the
  // rows aren't even in the form (field read access).
  const { user } = useAuth();
  // 023-admin-i18n (US4) — the editor in the member's language, read once at
  // mount like the role. The page's own content never changes with it.
  const { t, lang } = useAdminText();
  const blockRows = () => (getDataByPath("customCode.blocks") ?? []) as (CustomCodeRow & { codeId?: string })[];
  const customCodeHooks = React.useRef<CustomCodeHooks>(null as unknown as CustomCodeHooks);
  customCodeHooks.current = {
    isAdmin: (user as { role?: string } | null)?.role === "admin",
    getRow: (codeId) => blockRows().find((r) => r?.codeId === codeId),
    onCreate: (codeId) => {
      const rows = blockRows();
      addFieldRow({
        path: "customCode.blocks",
        schemaPath: "pages.customCode.blocks",
        rowIndex: rows.length,
        subFieldState: { codeId: cell(codeId), code: cell(""), consent: cell("consent") },
      });
    },
    onSave: (codeId, row) => {
      const index = blockRows().findIndex((r) => r?.codeId === codeId);
      if (index < 0) return;
      dispatchFields({ type: "UPDATE", path: `customCode.blocks.${index}.code`, value: row.code });
      dispatchFields({ type: "UPDATE", path: `customCode.blocks.${index}.consent`, value: row.consent });
      setModified(true);
    },
  };

  const holderRef = React.useRef<HTMLDivElement>(null);
  const editorRef = React.useRef<{
    destroy?: () => void;
    AssetManager?: { add: (a: unknown) => void };
  } | null>(null);

  React.useEffect(() => {
    let disposed = false;
    void (async () => {
      // Loaded together: the alias map shows replaced images with their current file (mediaAliases.ts).
      const [grapesjs, grapesFr, aliases] = await Promise.all([
        import("grapesjs").then((m) => m.default),
        import("grapesjs/locale/fr.mjs").then((m) => m.default),
        fetchMediaAliases(),
      ]);
      if (disposed || !holderRef.current) return;

      const addAssets = (docs: MediaDoc[]) =>
        editorRef.current?.AssetManager?.add(
          docs
            .filter((d) => (d.mimeType ?? "").startsWith("image/") && d.url)
            .map((d) => ({ type: "image", src: d.url, name: d.filename })),
        );

      const editor = grapesjs.init({
        container: holderRef.current,
        height: "600px",
        storageManager: false,
        // GrapesJS's own panels and tooltips (English built in).
        i18n: { locale: lang, detectLocale: false, localeFallback: "en", messages: { fr: grapesFr } },
        // 012-url-page-import — Section / Colonnes layout blocks. Registered
        // before `projectData` loads, so saved layouts reopen as their types.
        // 014 — same for the lead-form placeholder and « Code personnalisé » types.
        plugins: [
          (ed: GjsEditor) =>
            trefleLayoutPlugin(ed, {
              sectionLabel: t("editor.section"),
              sectionContentLabel: t("editor.sectionContent", { section: "{{section}}" }),
              columnsLabel: t("editor.columns"),
              columnsTraitLabel: t("editor.columns"),
              columnLabel: t("editor.column"),
              carousel: Object.fromEntries(Object.keys(CAROUSEL_LABELS_FR).map((k) => [k, t(`editor.carousel.${k}` as AdminKey)])),
            }),
          leadFormType,
          (ed: GjsEditor) => registerCustomCode(ed, customCodeHooks, { t, lang }),
        ],
        blockManager: {
          blocks: GJS_BLOCKS.map((b) => ({ id: b.id, label: t(b.label), content: b.content })),
        },
        assetManager: {
          // Never fall back to FileReader base64 — everything is uploaded.
          embedAsBase64: false,
          // GrapesJS disables the upload zone unless `embedAsBase64` or `upload`
          // is set. Point `upload` at the real endpoint so the drop/click zone
          // stays active; `uploadFile` below is what actually runs (size check,
          // `_payload` for the required `alt`), the built-in POST never fires.
          upload: "/api/media",
          uploadName: "file",
          autoAdd: true,
          uploadFile: async (e: unknown) => {
            const added: MediaDoc[] = [];
            for (const file of uploadEventFiles(e)) {
              if (file.size > MAX_IMAGE_BYTES) {
                window.alert(t("editor.imageTooLarge", { name: file.name, kb: Math.round(file.size / 1024), max: MAX_IMAGE_BYTES / 1024 }));
                continue;
              }
              const body = new FormData();
              body.append("file", file);
              // Payload reads non-file data from a `_payload` JSON part, not
              // from sibling form fields. `alt` is required on the collection.
              body.append("_payload", JSON.stringify({ alt: file.name }));
              const res = await fetch("/api/media", {
                method: "POST",
                body,
                credentials: "include",
              });
              if (!res.ok) {
                // uploadFile takes over the whole upload — GrapesJS never sees this
                // request, so a failure here is otherwise silent: no `asset:upload:error`
                // fires, the image just never appears in the picker.
                let reason = `HTTP ${res.status}`;
                try {
                  const body = (await res.json()) as { errors?: { message?: string }[] };
                  reason = body?.errors?.[0]?.message ?? reason;
                } catch {
                  /* response wasn't JSON — keep the HTTP status */
                }
                window.alert(t("editor.imageUploadFailed", { name: file.name, reason }));
                continue;
              }
              const { doc } = (await res.json()) as { doc: MediaDoc };
              if (doc?.url) added.push(doc);
            }
            addAssets(added);
          },
        },
        // Text-only elements stored without a type (starter templates before
        // 2026-10-11, any JSON source) load as editable texts — editableTexts.ts;
        // replaced images load with their current file — mediaAliases.ts.
        projectData: value && Object.keys(value).length ? applyMediaAliases(promoteEditableTexts(value), aliases) : undefined,
      });
      editorRef.current = editor as unknown as typeof editorRef.current;
      // 014-custom-code-editing, US2 — « Code » view (HTML/CSS editing).
      registerCodeView(editor, t);

      // Editor-only affordance for the otherwise-empty lead-form placeholder
      // (blocks.ts: near-invisible without this — an unstyled, unlabelled
      // div was impossible to click to select/reposition). Injected straight
      // into the canvas iframe's own document, NOT into the component's own
      // `style`/`components` — those get exported by `editor.getHtml()`/
      // `getCss()` and would publish this purely-editorial look straight
      // onto the real, live form. `::before` content never serialises into
      // HTML either way, so it can't leak even if this selector somehow
      // matched published markup.
      editor.on("load", () => {
        const doc = (editor as unknown as { Canvas: { getDocument: () => Document | null } }).Canvas.getDocument();
        if (!doc) return;
        const style = doc.createElement("style");
        style.textContent = `
          [data-block="lead-form"] {
            position: relative;
            outline: 2px dashed #9ca3af;
            outline-offset: -2px;
            background: #f3f4f6;
            min-height: 60px;
          }
          [data-block="lead-form"]::before {
            content: ${JSON.stringify(t("editor.leadFormPlaceholder"))};
            display: block;
            padding: 8px;
            font: 13px system-ui, sans-serif;
            color: #6b7280;
            text-align: center;
          }
        `;
        doc.head.appendChild(style);
        const gjs = editor as unknown as GjsWithStyles;
        defaultFontsRef.current ??= gjs.StyleManager?.getProperty("typography", "font-family")?.getOptions() ?? [];
        void applyDomainFonts(gjs, domainIdRef.current, defaultFontsRef.current);
      });

      // Seed the asset picker with images already in the Media library.
      try {
        const res = await fetch("/api/media?limit=200&depth=0&sort=-createdAt", {
          credentials: "include",
        });
        if (res.ok) addAssets(((await res.json()) as { docs?: MediaDoc[] }).docs ?? []);
      } catch {
        /* the picker just starts empty */
      }

      const sync = () => {
        setValue(editor.getProjectData() as Record<string, unknown>);
        html.setValue(exportHtml(editor.getHtml()));
        css.setValue(editor.getCss() ?? "");
      };
      editor.on("update", sync);

      editor.on("block:drag:stop", (component: unknown, block: unknown) => {
        if (!component || gjsBlockId(block) !== LEAD_FORM_BLOCK_ID) return;
        const rows = (formApi.current.getDataByPath("form.fields") ?? []) as { type?: string }[];
        if (rows.some((r) => r?.type === "email")) return;
        formApi.current.addFieldRow({
          path: "form.fields",
          schemaPath: "pages.form.fields",
          rowIndex: rows.length,
          subFieldState: {
            name: cell("email"),
            label: cell("Email"),
            type: cell("email"),
            required: cell(true),
          },
        });
      });
    })();
    return () => {
      disposed = true;
      editorRef.current?.destroy?.();
    };
  }, []); // mount once — the editor manages its own lifecycle

  // 015 — the domain changed in the sidebar: offer and load the new domain's fonts.
  React.useEffect(() => {
    const editor = editorRef.current as unknown as GjsWithStyles | null;
    if (!editor || !defaultFontsRef.current) return;
    void applyDomainFonts(editor, domainId, defaultFontsRef.current);
  }, [domainId]);

  return (
    <div className="field-type json-field">
      <label className="field-label">Contenu de la page (blocs)</label>
      <div
        ref={holderRef}
        style={{ border: "1px solid var(--theme-elevation-150)", borderRadius: 4 }}
      />
    </div>
  );
};

export default GrapesEditor;
