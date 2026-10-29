"use client";

import { useEffect } from "react";

import { parseConsentCookie } from "../lib/consent-cookie";

/**
 * 014-custom-code-editing, FR-008 / research R4 — runs the page's
 * consent-dependent code once the visitor has accepted cookies: at mount if
 * they accepted on an earlier visit, otherwise as soon as they click
 * « Accepter » (the banner dispatches `tf:consent`), without a reload. Never
 * on « Refuser » or no choice. Rendered by PageShell only when the page has
 * at least one `<template data-tf-consent>`.
 */
export const CONSENT_EVENT = "tf:consent";

/** A script that neither loads nor fails (a hung CDN) doesn't hold up the rest for longer than this. */
const EXTERNAL_SCRIPT_TIMEOUT_MS = 10_000;

export function ConsentCodeRunner({ nonce, always = false }: { nonce: string; always?: boolean }) {
  useEffect(() => {
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      void activateConsentTemplates(document, nonce);
    };
    if (always || parseConsentCookie(document.cookie)?.choice === "accepted") {
      run();
      return;
    }
    const onConsent = (e: Event) => {
      if ((e as CustomEvent<unknown>).detail === "accepted") run();
    };
    window.addEventListener(CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(CONSENT_EVENT, onConsent);
  }, [nonce, always]);
  return null;
}

/**
 * Swaps every `<template data-tf-consent>` for its content, in document
 * order. Scripts inside a template's content never run when inserted as is,
 * so each one is recreated (attributes and text copied, the request's
 * nonce set — scripts created by this nonce-trusted bundle with the nonce
 * are allowed by the CSP). An external script is awaited (load or error)
 * before the next script is inserted, so "library, then init" snippets keep
 * their order; a failing script never stops the others (FR-022).
 */
export async function activateConsentTemplates(root: Document, nonce: string): Promise<void> {
  const templates = Array.from(root.querySelectorAll<HTMLTemplateElement>("template[data-tf-consent]"));
  for (const template of templates) {
    const content = template.content.cloneNode(true) as DocumentFragment;
    // Markup first, with a marker where each script goes, then the scripts
    // one by one — so a script finds the widget container it targets.
    const pending = Array.from(content.querySelectorAll("script")).map((original) => {
      const marker = root.createComment("tf-script");
      original.replaceWith(marker);
      return { marker, original };
    });
    template.replaceWith(content);
    for (const { marker, original } of pending) {
      const script = root.createElement("script");
      for (const { name, value } of Array.from(original.attributes)) {
        if (name !== "nonce") script.setAttribute(name, value);
      }
      script.nonce = nonce;
      script.text = original.text;
      const external = original.hasAttribute("src");
      const settled =
        external && !original.hasAttribute("async")
          ? new Promise<void>((resolve) => {
              script.addEventListener("load", () => resolve(), { once: true });
              script.addEventListener("error", () => resolve(), { once: true });
              setTimeout(resolve, EXTERNAL_SCRIPT_TIMEOUT_MS);
            })
          : null;
      if (external) script.async = original.hasAttribute("async");
      marker.replaceWith(script);
      if (settled) await settled;
    }
  }
}
