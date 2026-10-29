import React from "react";
import type { Payload } from "payload";

import pkg from "../../package.json";
import { readBranding } from "../lib/branding";
import AdminChromeClient from "./AdminChrome.client";

/**
 * 022-ux-improvement (US4, research R9) — `admin.components.providers`: the
 * operator's wallpaper and the « Powered by Trefle » footer on every admin
 * screen, login page included. The release tag is the one `release.sh` wrote
 * to `RELEASE` (infra/.env → compose); the version number changes only when
 * the user decides it (apps/cms/package.json).
 */
export default async function AdminChrome({ children, payload }: { children: React.ReactNode; payload: Payload }) {
  const b = await readBranding(payload);
  return (
    <AdminChromeClient
      pattern={b.pattern}
      variant={b.variant}
      variantMode={b.variantMode}
      variantCount={b.variantCount}
      variantOneIn={b.variantOneIn}
      veilOpacity={b.veilOpacity}
      version={pkg.version}
      release={process.env.RELEASE || "dev"}
    >
      {children}
    </AdminChromeClient>
  );
}
