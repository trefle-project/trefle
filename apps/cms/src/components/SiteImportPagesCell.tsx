import type { DefaultServerCellComponentProps } from "payload";

/**
 * 015-penpot-site-import — the « Pages » column of the site imports list:
 * one link per draft the import created (like 012's ImportPageCell), the
 * board name when the page is not created (yet, or any more).
 */
type Row = { name?: string; page?: unknown };

const SiteImportPagesCell = ({ cellData }: DefaultServerCellComponentProps) => {
  const rows = Array.isArray(cellData) ? (cellData as Row[]) : [];
  if (!rows.length) return <span>—</span>;
  return (
    <span>
      {rows.map((row, i) => {
        const page = row.page;
        const id = typeof page === "object" && page !== null ? (page as { id?: unknown }).id : page;
        const label = row.name || "Page";
        return (
          <span key={i}>
            {i > 0 ? ", " : null}
            {id == null || id === "" ? label : <a href={`/admin/collections/pages/${String(id)}`}>{label}</a>}
          </span>
        );
      })}
    </span>
  );
};

export default SiteImportPagesCell;
