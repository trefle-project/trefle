"use client";

import React from "react";

import { useAdminText } from "../i18n/useAdminText";
import type { MediaUsage } from "../lib/media-usage";

/**
 * 017-edge-protection (contracts/media-usage.md) — shared by the « Utilisée
 * dans » panel and the replace confirmation: the lookup and the list.
 */
export type UsageState = { status: "loading" } | { status: "error" } | { status: "done"; usage: MediaUsage };

export async function fetchMediaUsage(id: string | number): Promise<MediaUsage> {
  const res = await fetch(`/api/media/${encodeURIComponent(String(id))}/usage`, { credentials: "include" });
  if (!res.ok) throw new Error(`usage ${res.status}`);
  return (await res.json()) as MediaUsage;
}

export function useMediaUsage(id: string | number | undefined, refreshKey?: unknown): UsageState | null {
  const [state, setState] = React.useState<UsageState | null>(null);
  React.useEffect(() => {
    if (id == null || id === "") return;
    let live = true;
    setState({ status: "loading" });
    fetchMediaUsage(id).then(
      (usage) => live && setState({ status: "done", usage }),
      () => live && setState({ status: "error" }),
    );
    return () => {
      live = false;
    };
  }, [id, refreshKey]);
  return state;
}

const FIRST = 20;

export function UsageList({ usage }: { usage: MediaUsage }) {
  const { t } = useAdminText();
  const [all, setAll] = React.useState(false);
  const lines: React.ReactNode[] = [
    ...usage.pages.map((p) => (
      <li key={`p${p.id}`}>
        <a href={p.adminUrl}>{p.title}</a>
        {" — "}
        {[p.domain, p.path].filter(Boolean).join("") || t("media.noAddress")}
        {" · "}
        {p.status === "published" ? t("media.published") : t("media.draft")}
        {p.isVariant ? t("media.abVariant") : ""}
        {p.via === "shareImage" ? t("media.shareImage") : ""}
      </li>
    )),
    ...usage.domains.map((d) => (
      <li key={`d${d.id}${d.via}`}>
        <a href={d.adminUrl}>
          {d.via === "favicon" ? t("media.domainFavicon", { host: d.hostname }) : t("media.domainShareImage", { host: d.hostname })}
        </a>
      </li>
    )),
  ];
  const hidden = lines.length - FIRST;
  return (
    <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
      {all ? lines : lines.slice(0, FIRST)}
      {!all && hidden > 0 ? (
        <li style={{ listStyle: "none" }}>
          <button type="button" className="btn btn--style-secondary btn--size-small" onClick={() => setAll(true)}>
            {t("media.andMore", { n: hidden })}
          </button>
        </li>
      ) : null}
    </ul>
  );
}
