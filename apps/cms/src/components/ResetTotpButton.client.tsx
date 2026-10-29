"use client";

import { toast, useAuth, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * 019-admin-access (FR-009, contracts/cms-endpoints.md « Reset button ») — on
 * a member's edit view, for Administrators, never on their own account:
 * clears the member's second factor so they set their authenticator app up
 * again at their next login (lost phone, departed device).
 */
const ResetTotpButton: React.FC = () => {
  const { user } = useAuth<{ id: number; role?: string }>();
  const { t } = useAdminText();
  const { id } = useDocumentInfo();
  const name = useFormFields(([fields]) => (fields.name?.value as string) || (fields.email?.value as string) || "");
  const [busy, setBusy] = React.useState(false);

  if (user?.role !== "admin" || id == null || String(id) === String(user.id)) return null;

  const onClick = async () => {
    if (!window.confirm(t("members.resetTotpConfirm", { name: name || t("members.thisMember") }))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/users/${id}/reset-totp`, { method: "POST", credentials: "include" });
      if (res.status === 204) {
        toast.success(t("members.resetTotpDone"));
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(j.error ?? t("members.resetTotpRefused", { status: res.status }));
      }
    } catch {
      toast.error(t("members.resetTotpFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ margin: "0 0 24px" }}>
      <button type="button" className="btn btn--style-secondary btn--size-small" onClick={onClick} disabled={busy}>
        {t("members.resetTotp")}
      </button>
    </div>
  );
};

export default ResetTotpButton;
