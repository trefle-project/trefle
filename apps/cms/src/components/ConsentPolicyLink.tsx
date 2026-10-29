import type { Payload } from "payload";

import { adminText } from "../i18n";

/**
 * 021-legal-pages (FR-011, research R5) — on a consent record, the archived
 * text of the privacy policy version the visitor was given.
 */
export default async function ConsentPolicyLink({
  data,
  payload,
  i18n,
}: {
  data?: { privacyNoticeVersion?: string | null };
  payload: Payload;
  i18n?: { language?: string };
}) {
  const t = adminText(i18n?.language);
  const version = data?.privacyNoticeVersion;
  if (!version) return null;
  const found = await payload.find({
    collection: "legal-versions",
    where: { and: [{ version: { equals: version } }, { kind: { equals: "privacy" } }] },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const row = found.docs[0];
  return (
    <p style={{ margin: "8px 0 16px" }}>
      <strong>{t("legal.acceptedPolicy")}</strong>
      {row ? <a href={`/admin/collections/legal-versions/${row.id}`}>{t("legal.archivedVersion", { version })}</a> : t("legal.notArchived", { version })}
    </p>
  );
}
