"use client";

import React from "react";
import type { DefaultCellComponentProps } from "payload";
import { useAuth, useConfig } from "@payloadcms/ui";

import { avatarUrl, colorOf, initialsOf } from "../lib/avatar";
import { useAdminText } from "../i18n/useAdminText";

/**
 * 022-ux-improvement (US5, FR-026, contracts/admin-ui.md « Avatars ») — a
 * member's avatar, or their initials on a coloured disc: on the account
 * button (`admin.avatar`), in the Users list and before the actor of an
 * Activity log entry (the admin's « modifié par »).
 */
type Member = { id?: number | string; name?: string | null; email?: string | null; avatar?: unknown };
type Img = { url?: string | null; sizes?: { avatar?: { url?: string | null } } };

function useImage(avatar: unknown): string | null {
  const { config } = useConfig();
  const [url, setUrl] = React.useState<string | null>(() => (avatar && typeof avatar === "object" ? avatarUrl(avatar as Img) : null));
  React.useEffect(() => {
    if (avatar && typeof avatar === "object") {
      setUrl(avatarUrl(avatar as Img));
      return;
    }
    if (avatar == null || avatar === "") {
      setUrl(null);
      return;
    }
    let alive = true;
    fetch(`${config.serverURL ?? ""}${config.routes.api}/admin-images/${avatar}?depth=0`, { credentials: "include" })
      .then((res) => (res.ok ? (res.json() as Promise<Img>) : null))
      .then((img) => alive && setUrl(avatarUrl(img)))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [avatar, config.routes.api, config.serverURL]);
  return url;
}

export function AvatarDisc({ member, size = 24 }: { member: Member | null | undefined; size?: number }) {
  const url = useImage(member?.avatar);
  const label = member?.name || member?.email || "";
  if (url) {
    // A user-uploaded square image from the asset host.
    return <img src={url} alt={label} width={size} height={size} style={{ borderRadius: "50%", objectFit: "cover", display: "inline-block", verticalAlign: "middle" }} />;
  }
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: colorOf(member?.id),
        color: "#fff",
        fontSize: Math.round(size * 0.42),
        fontWeight: 600,
        lineHeight: 1,
        verticalAlign: "middle",
        flexShrink: 0,
      }}
    >
      {initialsOf(member)}
    </span>
  );
}

/** `admin.avatar` — the signed-in member, on the account button. */
export default function AccountAvatar() {
  const { user } = useAuth<Member>();
  return <AvatarDisc member={user} size={24} />;
}

/** Users list: the row's member. First column, so it carries the link to the record (Payload's `link`). */
export function AvatarCell({ rowData, link, linkURL, collectionSlug }: DefaultCellComponentProps) {
  const { config } = useConfig();
  const member = rowData as Member;
  const disc = <AvatarDisc member={member} size={24} />;
  // Payload passes `link` and leaves the URL to the cell unless formatDocURL sets one.
  const href = linkURL ?? `${config.routes.admin}/collections/${collectionSlug}/${encodeURIComponent(String(member.id))}`;
  return link ? (
    <a href={href} aria-label={`Ouvrir ${member.name || member.email || "le membre"}`}>
      {disc}
    </a>
  ) : (
    disc
  );
}

/** Activity log: the actor's avatar before their e-mail (members an Editor may not read show their id). */
export function ActorCell({ cellData }: DefaultCellComponentProps) {
  const { config } = useConfig();
  const { t } = useAdminText();
  const [member, setMember] = React.useState<Member | null>(cellData && typeof cellData === "object" ? (cellData as Member) : null);
  React.useEffect(() => {
    if (cellData == null || typeof cellData === "object") return;
    let alive = true;
    fetch(`${config.serverURL ?? ""}${config.routes.api}/users/${cellData}?depth=0`, { credentials: "include" })
      .then((res) => (res.ok ? (res.json() as Promise<Member>) : null))
      .then((m) => alive && setMember(m))
      .catch(() => alive && setMember(null));
    return () => {
      alive = false;
    };
  }, [cellData, config.routes.api, config.serverURL]);
  if (cellData == null) return <span>{t("members.system")}</span>;
  if (!member) return <span>#{String(cellData)}</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <AvatarDisc member={member} size={20} />
      {member.email ?? member.name ?? `#${String(cellData)}`}
    </span>
  );
}
