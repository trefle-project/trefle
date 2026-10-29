import { getPayload } from "payload";

import config from "../payload.config";

/**
 * Per-page views / submissions / conversion above the Pages list (T055a,
 * SC-009, FR-037). Server component — aggregates `page-stats` rows.
 *
 * The anti-abuse / transient-failure counters live in the renderer's process
 * (apps/web) and are surfaced via its structured logs for now; a cross-process
 * dashboard is Phase 8.
 */
const PageStatsPanel = async () => {
  const payload = await getPayload({ config });

  const [stats, pages] = await Promise.all([
    payload.find({ collection: "page-stats", limit: 2000, depth: 0, overrideAccess: true }),
    payload.find({ collection: "pages", limit: 500, depth: 0, overrideAccess: true }),
  ]);

  const titleById = new Map<number | string, string>(
    (pages.docs as { id: number | string; title: string; path?: string }[]).map((p) => [
      p.id,
      `${p.title} ${p.path ?? ""}`.trim(),
    ]),
  );
  const agg = new Map<number | string, { views: number; submissions: number }>();
  for (const s of stats.docs as { page: number | string; views?: number; submissions?: number }[]) {
    const cur = agg.get(s.page) ?? { views: 0, submissions: 0 };
    cur.views += s.views ?? 0;
    cur.submissions += s.submissions ?? 0;
    agg.set(s.page, cur);
  }
  const rows = [...agg.entries()].sort((a, b) => b[1].submissions - a[1].submissions);

  return (
    <div style={{ margin: "0 0 16px", padding: 12, border: "1px solid var(--theme-elevation-150)", borderRadius: 4 }}>
      <strong style={{ fontSize: 13 }}>Statistiques par page (total)</strong>
      {rows.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.7 }}>Aucune donnée pour l’instant.</p>
      ) : (
        <table style={{ width: "100%", fontSize: 13, marginTop: 8, borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ textAlign: "left" }}>
              <th>Page</th>
              <th>Vues</th>
              <th>Soumissions</th>
              <th>Conversion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([id, v]) => (
              <tr key={String(id)}>
                <td>{titleById.get(id) ?? `#${id}`}</td>
                <td>{v.views}</td>
                <td>{v.submissions}</td>
                <td>{v.views ? `${((v.submissions / v.views) * 100).toFixed(1)} %` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

export default PageStatsPanel;
