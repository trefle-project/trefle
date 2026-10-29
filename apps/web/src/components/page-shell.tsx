import { codeIdsIn, fontFaceCss, type FontFile } from "@trefle/shared";

import { CustomCodeSnippet, HeadSnippet, snippetMode, type CodeContext } from "../lib/custom-code";
import { rewriteAssetLinks, rewriteBackgroundUrls, rewriteImageTags, type MediaAliases } from "../lib/imgproxy";
import type { LegalLinks } from "../lib/legal";
import type { PublishedPage } from "../lib/payload-client";
import { extractWrapper, renderPageBody, sanitizeHtml } from "../lib/render";
import { ConsentCodeRunner } from "./consent-code-runner";
import { LeadForm } from "./lead-form";

/**
 * Renders a published page (T045): the GrapesJS-exported HTML + CSS, with the
 * single lead-form placeholder replaced by the real server-driven form.
 * `preview` adds a fixed watermark (T049a). `code` (014) emits the page's
 * admin scripts with this request's CSP nonce; without it (tests, or a
 * caller that has no request nonce) no page code is emitted at all.
 */
export function PageShell({
  page,
  formToken,
  preview = false,
  formValues,
  formErrors,
  code,
  fonts,
  mediaAliases = {},
  legal,
}: {
  page: PublishedPage;
  formToken: string;
  preview?: boolean;
  /** 009-lead-form-error-recovery — a prior submission's values/errors, re-rendered inline by `/form-retry` instead of the empty default. */
  formValues?: Record<string, string>;
  formErrors?: Record<string, string>;
  /** 014-custom-code-editing — see `lib/code-context.ts`. */
  code?: CodeContext;
  /** 015-penpot-site-import, FR-026 — the domain's font files (`getDomainFonts`), served by Trefle. */
  fonts?: FontFile[];
  /** 017-edge-protection — `getMediaAliases()`: pages keep their images after a file replacement. */
  mediaAliases?: MediaAliases;
  /** 021-legal-pages — `legalLinks()`: the footer line and the form's privacy link. */
  legal?: LegalLinks;
}) {
  // 003-post-launch-improvements, FR-003 — sanitise first so everything
  // below (wrapper extraction, lead-form lookup, parsing) runs on trusted,
  // script-free HTML. T086 / 012 R9: published pages reference only signed,
  // sized ImgProxy URLs, for <img> and for CSS background images alike
  // (no-op until ASSET_ORIGIN + IMGPROXY_KEY/SALT are configured).
  // 017: every stored-file key goes through the media alias map first.
  const html = rewriteAssetLinks(
    rewriteBackgroundUrls(rewriteImageTags(sanitizeHtml(page.builder?.html ?? ""), undefined, mediaAliases), undefined, mediaAliases),
    mediaAliases,
  );
  // 014-custom-code-editing, research R7b — the CSS is emitted raw inside a
  // <style> element and is free text in the editor's « Code » view: a
  // `</style` sequence would close the element and let markup through.
  // `<\/style` means the same thing to CSS and can't end the element.
  const css = rewriteBackgroundUrls(page.builder?.css ?? "", undefined, mediaAliases).replace(/<\/style/gi, "<\\/style");
  // 015-penpot-site-import — the domain's @font-face rules, before the page CSS that uses them.
  const fontCss = fontFaceCss(fonts ?? []);
  const { inner, wrapperId, wrapperClassName, wrapperStyle } = extractWrapper(html);
  const shellClassName = ["trefle-page-shell", wrapperClassName].filter(Boolean).join(" ");
  // 012-url-page-import, FR-025 — the lead-form placeholder is replaced in
  // place, wherever it sits (top level or inside a Section / Column). The
  // real wrapper carries the placeholder's own id/class/style (whatever an
  // editor set on it in GrapesJS — position, width, background) so it isn't
  // silently discarded now that the placeholder itself is thrown away. No
  // background of its own by default, so the shell's colour shows through.
  // 014-custom-code-editing — admin page code (contracts/rendering.md): code
  // blocks in place of their placeholders, the head snippet first (its
  // meta/link tags hoisted into <head>), the end snippet last, and the
  // runner only when something waits for consent.
  const customCode = code ? page.customCode : undefined;
  const blockFor = (codeId: string) => customCode?.blocks?.find((b) => b.codeId === codeId);
  const body = renderPageBody(
    inner,
    (slot) => (
      <div id={slot.id} className={slot.className} style={slot.style}>
        <LeadForm
          pageId={page.id}
          formToken={formToken}
          form={page.form}
          values={formValues}
          errors={formErrors}
          privacyHref={legal?.policyHref}
          language={page.language?.code}
        />
      </div>
    ),
    (slot) =>
      code ? (
        // A block is a real box (not `display: contents`) so it sits in the
        // layout like any other block; its editor-set style still applies.
        <CustomCodeSnippet
          snippet={blockFor(slot.codeId)}
          ctx={code}
          name="block"
          id={slot.id}
          className={slot.className}
          style={slot.style ?? {}}
        />
      ) : null,
    { language: page.language?.code },
  );
  const needsRunner = [customCode?.head, customCode?.bodyEnd, ...codeIdsIn(inner).map(blockFor)].some(
    (s) => snippetMode(s) === "consent",
  );
  return (
    <>
      {/* 020 — tells the edge Worker which page it served (view counting). */}
      <meta name="tf-page" content={String(page.id)} />
      {code ? <HeadSnippet snippet={customCode?.head} ctx={code} /> : null}
      {fontCss ? <style data-trefle="domain-fonts" dangerouslySetInnerHTML={{ __html: fontCss }} /> : null}
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      {preview ? (
        <div
          style={{
            position: "fixed",
            top: 8,
            right: 8,
            zIndex: 9999,
            background: "#b91c1c",
            color: "#fff",
            font: "600 12px/1 system-ui, sans-serif",
            padding: "6px 10px",
            borderRadius: 4,
          }}
        >
          PREVIEW
        </div>
      ) : null}
      {/* `.trefle-page-shell` carries the GrapesJS export's own top-level
          wrapper identity (id/class/style — see extractWrapper in
          render.ts), not the individual `before`/`after` fragments. A real
          element that spans the full page width and (via `min-height:
          100vh` in globals.css) the full viewport height, so the page's
          chosen background colour — an `#<id>{background-color:...}` rule
          in page.builder.css — covers the whole page uniformly, including
          the row a lead-form sits in: `before`/`after` only ever span as
          wide as their own (often narrower, centred) content, so painting
          the background on them left white bands either side of the form.
          Since 012 there are no fragments at all: the page body is one
          parsed tree with the form replaced in place. */}
      {/* 023-admin-i18n (US6) — the page declares its own language (the
          document's is fixed by the root layout); error.tsx reads it. */}
      <div id={wrapperId} className={shellClassName} style={wrapperStyle} lang={page.language?.code} data-page-lang="">
        {body}
      </div>
      {/* 021-legal-pages (clarification 1, FR-007) — added by Trefle to every
          page, outside the page's own design. */}
      {legal ? (
        <footer className="trefle-legal-footer" lang={legal.language}>
          <a href={legal.noticeHref}>{legal.noticeLabel}</a>
          <span aria-hidden="true"> · </span>
          <a href={legal.policyHref}>{legal.policyLabel}</a>
        </footer>
      ) : null}
      {code ? <CustomCodeSnippet snippet={customCode?.bodyEnd} ctx={code} name="bodyEnd" /> : null}
      {needsRunner ? <ConsentCodeRunner nonce={code!.nonce} always={code!.preview} /> : null}
    </>
  );
}
