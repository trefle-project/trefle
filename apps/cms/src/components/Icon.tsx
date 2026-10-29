import React from "react";
import type { Payload } from "payload";
import { PayloadIcon } from "@payloadcms/ui/shared";

import { DEFAULT_NAME, readBranding } from "../lib/branding";

/**
 * 022-ux-improvement (US4) — `admin.components.graphics.Icon`: the operator's
 * square menu icon when uploaded (Settings → Default), else Trefle's bundled
 * clover (Payload's only if none at all).
 */
export default async function Icon({ payload }: { payload: Payload }) {
  const branding = await readBranding(payload);
  if (!branding.icon) return <PayloadIcon />;
  return <img src={branding.icon.url} alt={branding.name ?? DEFAULT_NAME} width={24} height={24} style={{ objectFit: "contain", display: "block" }} />;
}
