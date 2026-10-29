"use client";

import { useState, useSyncExternalStore } from "react";

import { parseConsentCookie, serializeConsentCookie, type ConsentChoice } from "../lib/consent-cookie";
import { CONSENT_EVENT } from "./consent-code-runner";

const noopSubscribe = () => () => {};
const hasNoPriorChoice = () => parseConsentCookie(document.cookie) === null;
// SSR/first hydration pass never has a real cookie to read — assume a
// choice already exists so the banner starts hidden (no flash), then let
// the client's own snapshot correct it immediately after (React re-renders
// once the client snapshot differs from the server one, no manual effect
// needed — see https://react.dev/reference/react/useSyncExternalStore).
const noPriorChoiceServerSnapshot = () => false;

/**
 * 007-gtm-tagging, User Story 1 — the cookie-consent banner.
 * `useSyncExternalStore` reads the consent cookie — a store outside
 * React's own state — without the cascading-render anti-pattern of
 * setting state from inside a `useEffect` (react-hooks/set-state-in-effect).
 * Accept/Reject write the cookie and update Consent Mode via the `gtag`
 * shim `<Tagging>`'s inline script defines on `window` (FR-008). The
 * revisit control (FR-007) is always rendered, regardless of any prior
 * choice.
 */
export function CookieConsentBanner({
  title,
  body,
  acceptLabel,
  rejectLabel,
  revisitLabel,
  privacy,
}: {
  title: string;
  body: string;
  acceptLabel: string;
  rejectLabel: string;
  revisitLabel: string;
  /** 021-legal-pages — the domain's privacy policy, readable before answering. */
  privacy?: { href: string; label: string };
}) {
  const noPriorChoiceOnLoad = useSyncExternalStore(noopSubscribe, hasNoPriorChoice, noPriorChoiceServerSnapshot);
  const [dismissed, setDismissed] = useState(false);
  const [revisited, setRevisited] = useState(false);
  const open = revisited || (!dismissed && noPriorChoiceOnLoad);

  const decide = (choice: ConsentChoice) => {
    document.cookie = serializeConsentCookie(choice);
    window.gtag?.("consent", "update", {
      analytics_storage: choice === "accepted" ? "granted" : "denied",
      ad_storage: choice === "accepted" ? "granted" : "denied",
      ad_user_data: choice === "accepted" ? "granted" : "denied",
      ad_personalization: choice === "accepted" ? "granted" : "denied",
    });
    // 014-custom-code-editing — lets ConsentCodeRunner run the page's
    // consent-dependent code right away, without a reload.
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
    setDismissed(true);
    setRevisited(false);
  };

  return (
    <>
      {open ? (
        <div
          role="region"
          aria-label={title}
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9998,
            background: "#1a1a1a",
            color: "#fff",
            padding: "1rem",
            display: "flex",
            flexWrap: "wrap",
            gap: "0.75rem",
            alignItems: "center",
            justifyContent: "space-between",
            font: "14px/1.5 system-ui, sans-serif",
          }}
        >
          <div style={{ flex: "1 1 20rem" }}>
            <strong>{title}</strong>
            <p style={{ margin: "0.25rem 0 0" }}>
              {body}
              {privacy ? (
                <>
                  {" "}
                  <a href={privacy.href} style={{ color: "#fff", textDecoration: "underline" }}>
                    {privacy.label}
                  </a>
                </>
              ) : null}
            </p>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
            <button type="button" onClick={() => decide("rejected")} style={{ padding: "0.5rem 1rem" }}>
              {rejectLabel}
            </button>
            <button
              type="button"
              onClick={() => decide("accepted")}
              style={{ padding: "0.5rem 1rem", background: "#fff", color: "#1a1a1a", border: 0, borderRadius: 4 }}
            >
              {acceptLabel}
            </button>
          </div>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => setRevisited(true)}
        aria-label={revisitLabel}
        style={{
          position: "fixed",
          left: "0.75rem",
          bottom: "0.75rem",
          zIndex: 9997,
          font: "12px/1 system-ui, sans-serif",
          padding: "0.4rem 0.6rem",
          background: "#fff",
          color: "#1a1a1a",
          border: "1px solid #ccc",
          borderRadius: 4,
        }}
      >
        {revisitLabel}
      </button>
    </>
  );
}
