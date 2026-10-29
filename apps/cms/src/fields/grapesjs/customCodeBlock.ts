import type { Editor } from "grapesjs";

import { CODE_ID_ATTR, CONSENT_VALUES, CUSTOM_CODE_MARKER, CUSTOM_CODE_MAX_LENGTH, type Consent } from "@trefle/shared";

import type { AdminText } from "../../i18n";
import { formatNumber } from "../../lib/admin-locale";
import { BUTTON_STYLE, EDITOR_FRAME_STYLE, codeViewer, el, openGuardedModal } from "./codeView";

/**
 * 014-custom-code-editing, User Story 3 — the « Code personnalisé » block.
 *
 * In the page it is only a placeholder, `<div data-block="custom-code"
 * data-code-id="…">`: the code lives in the page's admin-only
 * `customCode.blocks` rows (research R5), so it never reaches the canvas,
 * the page HTML, the sanitizer or an editor's browser, and never runs in the
 * admin (FR-005, FR-019). The renderer swaps the placeholder for its code on
 * the public page.
 *
 * Admins get the block in the library and edit a block's code by
 * double-clicking it. Editors can move or delete a block, nothing more
 * (FR-017) — UX only: field access and the pages-custom-code-guard hook are
 * the enforcement.
 */
export type CustomCodeRow = { code?: string | null; consent?: Consent | null };

export type CustomCodeHooks = {
  isAdmin: boolean;
  /** The block's row in the form, if any (never available to editors). */
  getRow: (codeId: string) => CustomCodeRow | undefined;
  /** A block was dropped: add its row. */
  onCreate: (codeId: string) => void;
  /** The admin saved the block's code in the modal: update its row. */
  onSave: (codeId: string, row: Required<CustomCodeRow>) => void;
};

export const CUSTOM_CODE_BLOCK_ID = CUSTOM_CODE_MARKER;

// Editor-only look, injected into the canvas document — never part of the
// component's own style, so it can't reach getHtml()/getCss() (same approach
// as the lead-form placeholder). `data-tf-empty` is set on the canvas element
// only, by the view, never on the model.
const canvasCss = (t: AdminText) => `
  [data-block="${CUSTOM_CODE_MARKER}"] {
    position: relative;
    min-height: 60px;
    outline: 2px dashed #7c3aed;
    outline-offset: -2px;
    background: #f5f3ff;
  }
  [data-block="${CUSTOM_CODE_MARKER}"]::before {
    content: ${JSON.stringify(t("editor.ccRuns"))};
    display: block;
    padding: 12px;
    font: 13px system-ui, sans-serif;
    color: #5b21b6;
    text-align: center;
  }
  [data-block="${CUSTOM_CODE_MARKER}"][data-tf-empty]::before {
    content: ${JSON.stringify(t("editor.ccEmpty"))};
  }
`;

const ICON =
  '<svg viewBox="0 0 24 24" width="32" height="32"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const newCodeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

type Words = { t: AdminText; lang: string };

function openCodeBlockModal(editor: Editor, codeId: string, hooks: CustomCodeHooks, onSaved: (code: string) => void, { t, lang }: Words) {
  const row = hooks.getRow(codeId);
  const viewer = codeViewer(editor, "htmlmixed");
  const box = el("div", { id: "trefle-custom-code", style: EDITOR_FRAME_STYLE }, [viewer.getElement()]);
  const counter = el("span", { style: "font-size:12px;opacity:.8" });
  const consent = el("select", { id: "trefle-custom-code-consent", style: "padding:6px;border-radius:4px;font:inherit" });
  for (const value of CONSENT_VALUES) {
    consent.append(
      el("option", {
        value,
        textContent: value === "consent" ? t("editor.ccConsent") : t("editor.ccEssential"),
        selected: (row?.consent ?? "consent") === value,
      }),
    );
  }
  const error = el("p", { role: "alert", style: "margin:0;color:#fca5a5" });
  const cancel = el("button", { type: "button", textContent: t("common.cancel"), style: BUTTON_STYLE });
  const save = el("button", {
    type: "button",
    textContent: t("editor.save"),
    style: `${BUTTON_STYLE};background:#047857;color:#fff;border-color:#047857`,
  });

  const content = el("div", { style: "display:grid;gap:8px" }, [
    el("p", {
      textContent: t("editor.ccIntro"),
      style: "margin:0;opacity:.85",
    }),
    box,
    el("div", { style: "display:flex;justify-content:space-between;align-items:center;gap:8px" }, [
      el("label", { htmlFor: consent.id, style: "display:flex;gap:8px;align-items:center" }, [t("editor.consent"), consent]),
      counter,
    ]),
    el("p", {
      textContent: t("editor.ccConsentHelp"),
      style: "margin:0;font-size:12px;opacity:.75",
    }),
    error,
    el("div", { style: "display:flex;gap:8px;justify-content:flex-end" }, [cancel, save]),
  ]);

  openGuardedModal(editor, t("editor.customCode"), content);
  viewer.getEditor().setSize(null, 320);
  viewer.setContent(row?.code ?? "");
  const updateCounter = () => {
    const n = viewer.getContent().length;
    counter.textContent = t("editor.ccCounter", { n: formatNumber(n, lang), max: formatNumber(CUSTOM_CODE_MAX_LENGTH, lang) });
    counter.style.color = n > CUSTOM_CODE_MAX_LENGTH ? "#fca5a5" : "";
  };
  updateCounter();
  viewer.getEditor().on("change", updateCounter);
  viewer.getEditor().focus();

  cancel.addEventListener("click", () => editor.Modal.close());
  save.addEventListener("click", () => {
    const code = viewer.getContent();
    if (code.length > CUSTOM_CODE_MAX_LENGTH) {
      error.textContent = t("errors.codeTooLong", { max: formatNumber(CUSTOM_CODE_MAX_LENGTH, lang) });
      return;
    }
    hooks.onSave(codeId, { code, consent: consent.value as Consent });
    onSaved(code);
    editor.Modal.close();
  });
}

/**
 * Registers the component type (before `projectData` loads, so saved blocks
 * reopen as this type) and, for admins, the library block and its editor.
 * `hooks` is read at call time, so the caller can keep it current.
 */
export function registerCustomCode(editor: Editor, hooks: { current: CustomCodeHooks }, words: Words) {
  const { t } = words;
  const { Components, Blocks } = editor;

  if (!Components.getType(CUSTOM_CODE_MARKER)) {
    // GrapesJS rewrites the element's attributes from the model on every
    // attribute change, wiping the canvas-only `data-tf-empty` marker: it is
    // re-applied right after.
    const baseUpdateAttributes = (Components.getType("default")!.view.prototype as { updateAttributes: () => void })
      .updateAttributes;
    Components.addType(CUSTOM_CODE_MARKER, {
      isComponent: (node: HTMLElement) =>
        typeof node.getAttribute === "function" && node.getAttribute("data-block") === CUSTOM_CODE_MARKER,
      model: {
        defaults: {
          name: t("editor.customCode"),
          tagName: "div",
          attributes: { "data-block": CUSTOM_CODE_MARKER },
          droppable: false,
          editable: false,
          // A copy would share the original's code id (and its code).
          copyable: false,
          // No trait panel: the code id is not something to edit by hand.
          traits: [],
          components: [],
        },
      },
      view: {
        events: { dblclick: "openCode" } as never,
        onRender() {
          this.refreshEmpty();
        },
        updateAttributes(this: { refreshEmpty: (code?: string) => void }) {
          baseUpdateAttributes.call(this);
          this.refreshEmpty();
        },
        // `savedCode`: just saved in the modal — the form row it went to
        // updates asynchronously, so reading it back here would be stale.
        refreshEmpty(this: { el: HTMLElement; model: { getAttributes: () => Record<string, string> } }, savedCode?: string) {
          if (!hooks.current.isAdmin) return; // editors can't see the code: no "empty" claim
          const id = this.model.getAttributes()[CODE_ID_ATTR];
          const code = savedCode ?? (id ? hooks.current.getRow(id)?.code : undefined);
          this.el.toggleAttribute("data-tf-empty", !code?.trim());
        },
        openCode(this: { model: { getAttributes: () => Record<string, string> }; refreshEmpty: (code?: string) => void }) {
          if (!hooks.current.isAdmin) return;
          const id = this.model.getAttributes()[CODE_ID_ATTR];
          if (id) openCodeBlockModal(editor, id, hooks.current, (code) => this.refreshEmpty(code), words);
        },
      },
    });
  }

  editor.on("load", () => {
    const doc = editor.Canvas.getDocument();
    if (!doc) return;
    const style = doc.createElement("style");
    style.textContent = canvasCss(t);
    doc.head.appendChild(style);
  });

  if (!hooks.current.isAdmin) return;

  // A new block gets its own id and form row, then opens its editor.
  type NewBlock = { addAttributes: (a: Record<string, string>) => void; view?: { openCode?: () => void } };
  const initNewBlock = (cmp: NewBlock) => {
    const id = newCodeId();
    cmp.addAttributes({ [CODE_ID_ATTR]: id });
    hooks.current.onCreate(id);
    cmp.view?.openCode?.();
  };

  type Placeable = {
    parent: () => Placeable | undefined;
    index: () => number;
    getAttributes: () => Record<string, string>;
    append: (def: object, opts?: { at?: number }) => NewBlock[];
  };
  const blockOf = (c: Placeable | undefined) => c?.getAttributes?.()["data-block"];

  Blocks.add(CUSTOM_CODE_BLOCK_ID, {
    label: t("editor.customCode"),
    media: ICON,
    attributes: { title: t("editor.blockHint") },
    content: { type: CUSTOM_CODE_MARKER },
    // Click to add (drag also works) — usable without dragging, e.g. from a
    // trackpad or keyboard. Goes right after the block holding the selection
    // (a text selected inside a hero → after the hero, not inside it); at the
    // end of a column when a column is selected; else at the end of the page.
    onClick: (_block: unknown, ed: Editor) => {
      const def = { type: CUSTOM_CODE_MARKER };
      let anchor = ed.getSelected() as unknown as Placeable | undefined;
      while (anchor && !blockOf(anchor)) anchor = anchor.parent();
      const container = anchor?.parent();
      const [cmp] =
        anchor && blockOf(anchor) === "column"
          ? anchor.append(def)
          : anchor && container
            ? container.append(def, { at: anchor.index() + 1 })
            : (ed.getWrapper() as unknown as Placeable).append(def);
      if (cmp) {
        ed.select(cmp as never);
        initNewBlock(cmp);
      }
    },
  });

  editor.on("block:drag:stop", (component: unknown, block: unknown) => {
    const b = block as { get?: (k: string) => unknown; id?: unknown } | undefined;
    if (component && (b?.get?.("id") ?? b?.id) === CUSTOM_CODE_BLOCK_ID) initNewBlock(component as NewBlock);
  });
}
