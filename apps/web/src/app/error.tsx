"use client";

import { useEffect, useSyncExternalStore } from "react";

import { ERROR_COPY } from "../lib/error-copy";

// 023-admin-i18n (US6) — the language the document declares around this
// boundary. Nothing to subscribe to: it does not change while shown.
const nearestLang = () => document.querySelector("[data-page-lang]")?.getAttribute("lang") ?? document.documentElement.lang;
const noSubscribe = () => () => {};

/**
 * T094 — route-segment error boundary. Beacons a non-personal report
 * (name + digest + path) to the server, then shows a plain retry page.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      const body = JSON.stringify({
        name: error.name,
        digest: error.digest,
        route: window.location.pathname,
      });
      navigator.sendBeacon?.("/api/client-error", body);
    } catch {
      /* never let reporting throw */
    }
  }, [error]);

  const lang = useSyncExternalStore(noSubscribe, nearestLang, () => "fr") === "fr" ? "fr" : "en";
  const copy = ERROR_COPY[lang];
  return (
    <main lang={lang} style={{ maxWidth: 640, margin: "10vh auto", padding: 24, font: "16px/1.5 system-ui, sans-serif" }}>
      <h1 style={{ fontSize: 20 }}>{copy.title}</h1>
      <p>{copy.text}</p>
      <button type="button" onClick={() => reset()} style={{ padding: "8px 14px", marginTop: 8 }}>
        {copy.retry}
      </button>
    </main>
  );
}
