"use client";

import React from "react";

import { useAdminText } from "../i18n/useAdminText";

/**
 * DSR quick actions above the Data-subject requests list (T065).
 * Access/portability export → opens the JSON in a new tab (Admin + Editor).
 * Erasure → Administrator only, double-confirmed (irreversible).
 */
const DsrActions: React.FC = () => {
  const { t } = useAdminText();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const runExport = async () => {
    if (!email) return;
    const res = await fetch("/api/dsr-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      credentials: "include",
    });
    if (!res.ok) return setMsg(t("leads.exportRefused", { status: res.status }));
    const blob = await res.blob();
    window.open(URL.createObjectURL(blob), "_blank");
    setMsg(t("leads.exportOpened"));
  };

  const runErase = async () => {
    if (!email) return;
    if (!window.confirm(t("leads.eraseConfirm", { email }))) return;
    if (!window.confirm(t("leads.eraseConfirmAgain"))) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dsr-erase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      const j = (await res.json()) as { ok?: boolean; erased?: number; code?: string };
      setMsg(res.ok && j.ok ? t("leads.erased", { n: j.erased ?? 0 }) : t("leads.eraseRefused", { code: j.code ?? res.status }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "0 0 12px" }}>
      <input
        type="email"
        placeholder={t("leads.requesterEmail")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ padding: "6px 8px", border: "1px solid var(--theme-elevation-250)", borderRadius: 4, minWidth: 240 }}
      />
      <button type="button" onClick={runExport} disabled={!email || busy} style={btn}>
        {t("leads.exportAccess")}
      </button>
      <button type="button" onClick={runErase} disabled={!email || busy} style={{ ...btn, borderColor: "#b91c1c", color: "#b91c1c" }}>
        {t("leads.erase")}
      </button>
      {msg ? <span style={{ fontSize: 13 }}>{msg}</span> : null}
    </div>
  );
};

const btn: React.CSSProperties = {
  padding: "6px 10px",
  border: "1px solid var(--theme-elevation-250)",
  borderRadius: 4,
  background: "transparent",
  cursor: "pointer",
};

export default DsrActions;
