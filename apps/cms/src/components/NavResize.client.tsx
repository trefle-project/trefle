"use client";

import React from "react";
import { createPortal } from "react-dom";
import { usePreferences } from "@payloadcms/ui";
import { useAdminText } from "../i18n/useAdminText";

/**
 * 022-ux-improvement (US2, FR-015, contracts/admin-ui.md) — a handle on the
 * open menu's right edge: drag (or ←/→) to resize, double-click or Enter to
 * go back to 275 px. The width is a Payload preference (`nav-width`), so it
 * follows the member across devices; a localStorage copy only avoids a jump
 * on load. Applied through `--trefle-nav-width` (custom.css), above the
 * phone breakpoint only. The handle is portaled to <body> and fixed on the
 * menu's edge: inside the menu, the page content would cover it.
 */
const KEY = "nav-width";
const LOCAL = "trefle-nav-width";
const DEFAULT = 275;
const STEP = 16;

const clamp = (px: number) => Math.round(Math.min(480, Math.max(200, px, 0), Math.max(200, window.innerWidth * 0.5)));

function apply(px: number | null) {
  if (px === null) document.documentElement.style.removeProperty("--trefle-nav-width");
  else document.documentElement.style.setProperty("--trefle-nav-width", `${px}px`);
}

export default function NavResize() {
  const { getPreference, setPreference } = usePreferences();
  const { t } = useAdminText();
  const [nav, setNav] = React.useState<HTMLElement | null>(null);
  const [mounted, setMounted] = React.useState(false);
  const [width, setWidth] = React.useState<number>(DEFAULT);

  React.useEffect(() => {
    setNav(document.querySelector<HTMLElement>("aside.nav, .nav"));
    setMounted(true);
    try {
      const cached = Number(window.localStorage.getItem(LOCAL));
      if (cached) {
        setWidth(clamp(cached));
        apply(clamp(cached));
      }
    } catch {
      /* storage unavailable: the server preference below still applies */
    }
    void getPreference<number>(KEY).then((stored) => {
      if (typeof stored === "number" && stored > 0) {
        setWidth(clamp(stored));
        apply(clamp(stored));
      }
    });
  }, [getPreference]);

  const save = React.useCallback(
    (px: number | null) => {
      try {
        if (px === null) window.localStorage.removeItem(LOCAL);
        else window.localStorage.setItem(LOCAL, String(px));
      } catch {
        /* ignore */
      }
      void setPreference(KEY, px ?? DEFAULT);
    },
    [setPreference],
  );

  const set = (px: number) => {
    const next = clamp(px);
    setWidth(next);
    apply(next);
    return next;
  };
  const reset = () => {
    setWidth(DEFAULT);
    apply(null);
    save(null);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    const left = nav?.getBoundingClientRect().left ?? 0;
    let last = width;
    const move = (ev: PointerEvent) => {
      last = set(ev.clientX - left);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.removeProperty("user-select");
      save(last);
    };
    document.body.style.setProperty("user-select", "none");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!mounted) return null;
  return createPortal(
    <button
      type="button"
      className="trefle-nav-resize"
      role="separator"
      aria-orientation="vertical"
      aria-label={t("nav.menuWidth")}
      aria-valuenow={width}
      aria-valuemin={200}
      aria-valuemax={480}
      title={t("nav.menuWidthTitle")}
      onPointerDown={onPointerDown}
      onDoubleClick={reset}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          save(set(width + (e.key === "ArrowRight" ? STEP : -STEP)));
        } else if (e.key === "Enter") {
          e.preventDefault();
          reset();
        }
      }}
    />,
    document.body,
  );
}
