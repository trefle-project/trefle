import type { Component, Editor } from "grapesjs";
import DOMPurify from "dompurify";

import type { AdminText } from "../../i18n";
import { WARNING_SANITIZE_CONFIG, droppedMarkupMessages, type RemovedEntry } from "./codeViewMessages";

/**
 * 014-custom-code-editing, User Story 2 — the « Code » view: the page's HTML
 * and CSS as editable code (FR-009/FR-010), with the list of what
 * publication will drop shown *before* applying (FR-014).
 *
 * The two editors are GrapesJS's own CodeMirror 5 viewers
 * (`CodeManager.createViewer`, the ones behind its read-only « View code »),
 * switched to editable: syntax colouring, line numbers, auto-indent and an
 * initial auto-format come with GrapesJS — no extra dependency.
 *
 * HTML shown is the canvas wrapper's *children*, not `editor.getHtml()`:
 * the latter wraps everything in the wrapper's own `<body id=…>` once the
 * page background is styled (see exportHtml.ts), and applying that back
 * would nest a second element carrying the wrapper's id inside the wrapper.
 * The wrapper keeps its own id and its rules stay visible in the CSS area.
 *
 * CSS shown is every defined rule (`keepUnusedStyles`) minus GrapesJS's own
 * protected reset (`avoidProtected`), so a round-trip neither hides a rule
 * nor duplicates the reset.
 *
 * Only the part that was actually edited is applied back: the initial
 * auto-format re-indents the HTML, and re-parsing untouched markup could
 * change whitespace between inline elements for nothing.
 *
 * `<script>` never reaches the canvas: GrapesJS's `allowScripts` stays at its
 * default (false). Scripts are admin-only and live outside the page HTML.
 */
export const CODE_VIEW_COMMAND = "trefle:code-view";

export const BUTTON_STYLE =
  "padding:8px 14px;border-radius:4px;border:1px solid rgba(255,255,255,.3);cursor:pointer;font:inherit";
export const EDITOR_FRAME_STYLE = "border:1px solid rgba(255,255,255,.2);border-radius:4px;overflow:hidden;font-size:13px";

/** The subset of GrapesJS's CodeMirror viewer this module uses (untyped in grapesjs' d.ts). */
export type CodeViewer = {
  getElement(): HTMLElement;
  setContent(value: string): void;
  getContent(): string;
  getEditor(): {
    setSize(width: string | number | null, height: string | number): void;
    on(event: "change", handler: () => void): void;
    focus(): void;
    refresh(): void;
  };
};

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: Omit<Partial<HTMLElementTagNameMap[K]>, "style"> & { style?: string },
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { style, ...rest } = props ?? {};
  Object.assign(node, rest);
  if (style) node.setAttribute("style", style);
  node.append(...children);
  return node;
}

function currentHtml(editor: Editor): string {
  return editor
    .getComponents()
    .map((c: Component) => c.toHTML())
    .join("\n");
}

export function codeViewer(editor: Editor, codeName: "htmlmixed" | "css"): CodeViewer {
  return editor.CodeManager.createViewer({
    codeName,
    readOnly: false,
    theme: "hopscotch",
    lineNumbers: true,
    autoFormat: true,
    tabSize: 2,
    indentUnit: 2,
    smartIndent: true,
  }) as CodeViewer;
}

function openCodeView(editor: Editor, t: AdminText) {
  const htmlViewer = codeViewer(editor, "htmlmixed");
  const cssViewer = codeViewer(editor, "css");
  const htmlBox = el("div", { id: "trefle-code-html", style: EDITOR_FRAME_STYLE }, [htmlViewer.getElement()]);
  const cssBox = el("div", { id: "trefle-code-css", style: EDITOR_FRAME_STYLE }, [cssViewer.getElement()]);

  const warnings = el("div", { role: "alert", style: "margin-top:12px" });
  const cancel = el("button", { type: "button", textContent: t("common.cancel"), style: BUTTON_STYLE });
  const apply = el("button", {
    type: "button",
    textContent: t("editor.checkApply"),
    style: `${BUTTON_STYLE};background:#047857;color:#fff;border-color:#047857`,
  });
  const back = el("button", { type: "button", textContent: t("editor.backToCode"), style: BUTTON_STYLE, hidden: true });
  const format = el("button", {
    type: "button",
    textContent: t("editor.format"),
    title: t("editor.formatTitle"),
    style: `${BUTTON_STYLE};margin-right:auto`,
  });

  const content = el("div", { style: "display:grid;gap:6px" }, [
    el("div", { textContent: "HTML", style: "font-weight:600" }),
    htmlBox,
    el("div", { textContent: "CSS", style: "font-weight:600;margin-top:8px" }),
    cssBox,
    warnings,
    el("div", { style: "display:flex;gap:8px;justify-content:flex-end;margin-top:12px" }, [format, back, cancel, apply]),
  ]);

  openGuardedModal(editor, t("editor.pageCode"), content);

  // CodeMirror measures its container: fill the editors once they're in the DOM.
  htmlViewer.getEditor().setSize(null, 360);
  cssViewer.getEditor().setSize(null, 200);
  htmlViewer.setContent(currentHtml(editor));
  cssViewer.setContent(editor.getCss({ avoidProtected: true, keepUnusedStyles: true }) ?? "");
  const initialHtml = htmlViewer.getContent();
  const initialCss = cssViewer.getContent();
  htmlViewer.getEditor().focus();

  // After a warning, a second click on `apply` applies anyway; any edit to
  // the HTML re-arms the check.
  let confirmed = false;
  const resetCheck = () => {
    confirmed = false;
    warnings.replaceChildren();
    back.hidden = true;
    apply.textContent = t("editor.checkApply");
  };
  htmlViewer.getEditor().on("change", resetCheck);
  back.addEventListener("click", () => {
    resetCheck();
    htmlViewer.getEditor().focus();
  });
  cancel.addEventListener("click", () => editor.Modal.close());
  // `setContent` runs the viewer's auto-format; feeding it its own content
  // re-indents pasted code on demand.
  format.addEventListener("click", () => {
    htmlViewer.setContent(htmlViewer.getContent());
    cssViewer.setContent(cssViewer.getContent());
  });

  apply.addEventListener("click", () => {
    const html = htmlViewer.getContent();
    const css = cssViewer.getContent();
    const htmlChanged = html !== initialHtml;
    if (htmlChanged && !confirmed) {
      DOMPurify.sanitize(html, WARNING_SANITIZE_CONFIG);
      const messages = droppedMarkupMessages(DOMPurify.removed as RemovedEntry[], t);
      if (messages.length) {
        confirmed = true;
        warnings.replaceChildren(
          el("p", {
            textContent: t("editor.notPublished"),
            style: "margin:0 0 6px;font-weight:600",
          }),
          el(
            "ul",
            { style: "margin:0;padding-left:18px" },
            messages.map((m) => el("li", { textContent: m })),
          ),
        );
        back.hidden = false;
        apply.textContent = t("editor.applyAnyway");
        return;
      }
    }
    // Both calls go through GrapesJS's UndoManager in one call stack, so a
    // single Ctrl/Cmd+Z restores the page as it was before applying.
    // `setComponents` removes the old components, and GrapesJS deletes every
    // `#id` rule of a removed component with it — that's where most of the
    // page's styling lives (inline styles, imports). The re-parsed HTML keeps
    // the same ids, so the CSS is re-applied whenever the HTML is.
    if (htmlChanged) editor.setComponents(html);
    if (htmlChanged || css !== initialCss) editor.setStyle(css);
    editor.Modal.close();
  });
}

/**
 * Opens `content` in the GrapesJS modal, for editing code: a stray click on
 * the backdrop would close it and lose the edit, so backdrop-closing is off
 * while it's open (the config object is the module's, shared with the asset
 * manager — restored on close). GrapesJS parks a closed modal's content in a
 * hidden collector rather than dropping it: ours is removed on close, or
 * every reopening would stack another copy (and duplicate ids) in the page.
 */
export function openGuardedModal(editor: Editor, title: string, content: HTMLElement) {
  const modalConfig = editor.Modal.getConfig() as { backdrop?: boolean };
  const backdrop = modalConfig.backdrop;
  modalConfig.backdrop = false;
  editor.Modal.onceClose(() => {
    modalConfig.backdrop = backdrop;
    content.remove();
  });
  editor.Modal.open({ title, content });
}

/** Adds the command and replaces GrapesJS's read-only « View code » button with it. */
export function registerCodeView(editor: Editor, t: AdminText) {
  editor.Commands.add(CODE_VIEW_COMMAND, { run: (ed: Editor) => openCodeView(ed, t) });
  editor.Panels.removeButton("options", "export-template");
  editor.Panels.addButton("options", {
    id: CODE_VIEW_COMMAND,
    className: "fa fa-code",
    command: CODE_VIEW_COMMAND,
    togglable: false,
    attributes: { title: t("editor.editCode") },
  });
}
