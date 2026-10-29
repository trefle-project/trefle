"use client";

import { useEffect } from "react";

import { ERROR_COPY } from "../lib/error-copy";

// 023-admin-i18n (US6) — no page around this one to take a language from: English.
const copy = ERROR_COPY.en;

/**
 * T094 — top-level error boundary (replaces the root layout when it is the
 * layout itself that threw). Must render its own <html>/<body>.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    try {
      navigator.sendBeacon?.(
        "/api/client-error",
        JSON.stringify({ name: error.name, digest: error.digest, route: window.location.pathname, fatal: true }),
      );
    } catch {
      /* never let reporting throw */
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, font: "16px/1.5 system-ui, sans-serif" }}>
        <main style={{ maxWidth: 640, margin: "10vh auto", padding: 24 }}>
          <h1 style={{ fontSize: 20 }}>{copy.globalTitle}</h1>
          <p>{copy.globalText}</p>
          <button type="button" onClick={() => reset()} style={{ padding: "8px 14px", marginTop: 8 }}>
            {copy.retry}
          </button>
        </main>
      </body>
    </html>
  );
}
