import React from "react";
import type { Payload } from "payload";

import { DEFAULT_NAME, readBranding } from "../lib/branding";

/**
 * 003-post-launch-improvements, FR-021 — replaces Payload's stock logo on the
 * admin login page via `admin.components.graphics.Logo` (Payload's own
 * documented branding slot — no CSS override hacking).
 *
 * 022-ux-improvement (US4) — the installation operator's logo when one is
 * uploaded (Settings → Default), else Trefle's bundled clover; the text
 * wordmark (their name, else « Trefle ») is kept for a branding without a
 * logo. Themed with the same CSS variable Payload's own logo uses.
 */
export default async function Logo({ payload }: { payload: Payload }) {
  const branding = await readBranding(payload);
  const name = branding.name ?? DEFAULT_NAME;
  if (branding.logo) {
    return <img src={branding.logo.url} alt={name} style={{ maxHeight: 64, maxWidth: "100%", display: "block" }} />;
  }
  return (
    <span
      style={{
        display: "inline-block",
        fontFamily: "system-ui, sans-serif",
        fontSize: 32,
        fontWeight: 700,
        letterSpacing: "-0.02em",
        color: "var(--theme-elevation-1000)",
      }}
    >
      {name}
    </span>
  );
}
