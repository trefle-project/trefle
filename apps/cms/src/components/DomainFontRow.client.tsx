"use client";

import { useDocumentInfo, useRowLabel } from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";

type Row = { family?: string; weights?: string[]; italic?: boolean };

/** Usage counts are fetched once per domain view and shared by every row. */
const cache = new Map<string, Promise<Record<string, number>>>();
const usageFor = (id: string) => {
  if (!cache.has(id)) {
    cache.set(
      id,
      fetch(`/api/domains/${id}/font-usage`, { credentials: "include" })
        .then((r) => (r.ok ? (r.json() as Promise<Record<string, number>>) : {}))
        .catch(() => ({})),
    );
  }
  return cache.get(id)!;
};

/**
 * « Polices du domaine » row label (015-penpot-site-import, FR-028): the
 * family, its weights, and how many of the domain's pages use it, so an
 * administrator sees the impact before removing a font.
 */
export default function DomainFontRow() {
  const { t } = useAdminText();
  const { data, rowNumber } = useRowLabel<Row>();
  const { id } = useDocumentInfo();
  const [count, setCount] = React.useState<number | null>(null);
  const family = data?.family?.trim() ?? "";

  React.useEffect(() => {
    if (!id || !family) return;
    let live = true;
    void usageFor(String(id)).then((u) => live && setCount(u[family] ?? 0));
    return () => {
      live = false;
    };
  }, [id, family]);

  if (!family) return <span>{t("fonts.rowN", { n: (rowNumber ?? 0) + 1 })}</span>;
  const weights = (data?.weights ?? []).join(", ");
  const used =
    count == null
      ? ""
      : count === 0
        ? t("fonts.usedByNone")
        : t(count === 1 ? "fonts.usedByOne" : "fonts.usedByMany", { n: count });
  return (
    <span>
      {family}
      {weights ? ` (${weights}${data?.italic ? t("fonts.italic") : ""})` : ""}
      {used}
    </span>
  );
}
