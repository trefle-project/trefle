"use client";

import { useAuth, useDocumentInfo } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import type React from "react";

/**
 * 023-admin-i18n (US2, FR-006) — after members save a new admin language on
 * their own account, the save's response has set the language cookie
 * (hooks/users-admin-language.ts); refreshing re-renders the admin in it, with
 * no sign-out. Renders nothing; sits after the `adminLanguage` input.
 */
const AdminLanguageRefresh: React.FC = () => {
  const { id, savedDocumentData } = useDocumentInfo();
  const { user } = useAuth();
  const router = useRouter();
  const saved = (savedDocumentData as { adminLanguage?: string | null } | undefined)?.adminLanguage ?? null;
  const previous = useRef(saved);

  useEffect(() => {
    if (saved === previous.current) return;
    previous.current = saved;
    if (user?.id === id) router.refresh();
  }, [saved, id, user?.id, router]);

  return null;
};

export default AdminLanguageRefresh;
