import type { DefaultServerCellComponentProps } from "payload";

import { adminText } from "../i18n";

/**
 * 012-url-page-import — the "Brouillon créé" column of the imports list: a
 * direct link to the draft page an import created (FR-004a), instead of
 * Payload's default cell, which only links to the import itself.
 */
const ImportPageCell = ({ cellData, i18n }: DefaultServerCellComponentProps) => {
  const id = typeof cellData === "object" && cellData !== null ? (cellData as { id?: unknown }).id : cellData;
  if (id == null || id === "") return <span>—</span>;
  const title = typeof cellData === "object" && cellData !== null ? (cellData as { title?: string }).title : undefined;
  return <a href={`/admin/collections/pages/${String(id)}`}>{title || adminText(i18n?.language)("imports.openDraft")}</a>;
};

export default ImportPageCell;
