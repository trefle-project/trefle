import type { Payload } from "payload";

import { adminLanguageOf, adminText } from "../i18n";
import { formatEur, intlLocale, isPlural } from "../lib/admin-locale";
import { formatParisMidnight, monthBounds, userBudgetEur } from "../lib/import/budget";

/**
 * 012-url-page-import (T048, FR-027a/FR-027f) — above the "Imports de pages"
 * list, for Administrators only: this month's import spending against the
 * workspace cap, when it resets, and each member's spending against their
 * budget with a link to adjust it on their user record.
 */
type User = { id: number; email?: string; role?: string; isActive?: boolean; isService?: boolean; importMonthlyBudgetEur?: number | null };

const box = { margin: "16px 0", padding: "12px 16px", border: "1px solid var(--theme-elevation-150)", borderRadius: 4 } as const;

export default async function ImportBudgetBanner({
  payload,
  user,
  i18n,
}: {
  payload: Payload;
  user?: { role?: string } | null;
  i18n?: { language?: string };
}) {
  if (user?.role !== "admin") return null;
  const lang = adminLanguageOf(i18n?.language);
  const t = adminText(lang);
  const eur = (n: number) => formatEur(n, lang);

  let data;
  try {
    const now = new Date();
    const { start, end } = monthBounds(now);
    const [settings, imports, users] = await Promise.all([
      payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true }),
      payload.find({
        collection: "page-imports",
        where: {
          and: [{ startedAt: { greater_than_equal: start.toISOString() } }, { startedAt: { less_than: end.toISOString() } }],
        },
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { costEur: true, createdBy: true },
      }),
      payload.find({ collection: "users", pagination: false, depth: 0, overrideAccess: true, sort: "email" }),
    ]);
    const spentBy = new Map<number, number>();
    for (const d of imports.docs) {
      const by = typeof d.createdBy === "object" ? d.createdBy?.id : d.createdBy;
      if (by != null) spentBy.set(by, (spentBy.get(by) ?? 0) + (d.costEur ?? 0));
    }
    data = {
      capEur: settings.importMonthlyCapEur ?? 20,
      totalEur: [...spentBy.values()].reduce((a, b) => a + b, 0),
      count: imports.docs.length,
      resetsAt: formatParisMidnight(end),
      rows: (users.docs as unknown as User[])
        .filter((u) => !u.isService && u.isActive !== false)
        .map((u) => ({ user: u, spent: spentBy.get(u.id) ?? 0, ...userBudgetEur(u, settings) })),
    };
  } catch {
    return (
      <div role="alert" style={box}>
        {t("imports.budgetLoadFailed")}
      </div>
    );
  }

  const resetDay = new Date(data.resetsAt).toLocaleDateString(intlLocale(lang), { day: "numeric", month: "long", timeZone: "Europe/Paris" });
  return (
    <div style={box}>
      <strong>
        {t("imports.monthTotal", { spent: eur(data.totalEur), cap: eur(data.capEur) })}
        {data.capEur === 0 ? t("imports.importsOff") : ""}
      </strong>
      <p style={{ margin: "4px 0 8px" }}>
        {data.count === 0
          ? t("imports.noneThisMonth")
          : t(isPlural(data.count, lang) ? "imports.countMany" : "imports.countOne", { n: data.count })}
        {t("imports.resetsOn", { date: resetDay })}
      </p>
      <table style={{ borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "2px 12px 2px 0" }}>{t("imports.colMember")}</th>
            <th style={{ textAlign: "right", padding: "2px 12px" }}>{t("imports.colSpent")}</th>
            <th style={{ textAlign: "right", padding: "2px 12px" }}>{t("imports.colBudget")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r) => (
            <tr key={r.user.id}>
              <td style={{ padding: "2px 12px 2px 0" }}>{r.user.email}</td>
              <td style={{ textAlign: "right", padding: "2px 12px" }}>{eur(r.spent)}</td>
              <td style={{ textAlign: "right", padding: "2px 12px" }}>
                {eur(r.budgetEur)} {r.isDefault ? t("imports.byDefault") : t("imports.ownBudget")}
              </td>
              <td style={{ padding: "2px 0 2px 12px" }}>
                <a href={`/admin/collections/users/${r.user.id}`}>{t("imports.editBudget")}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
