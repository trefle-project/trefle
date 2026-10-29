"use client";

import { useDocumentInfo, useForm } from "@payloadcms/ui";
import React from "react";
import { useRouter } from "next/navigation";

import { PAGE_WIZARD_STASH_KEY, shouldRedirectToWizard, stashToFieldUpdates, type PageWizardStash } from "./pageWizardStash";

const WIZARD_PATH = "/admin/collections/pages/wizard";

/**
 * 004-page-types, FR-016/FR-017, US4 — rendered via
 * `admin.components.edit.beforeDocumentControls` on Pages.ts (the same slot
 * 003 uses for `RevalidationStatus`), on both the create and edit views.
 *
 * On mount: reads and clears the wizard's sessionStorage stash and applies
 * it to the form via `dispatchFields` (research.md §9); if there is no
 * stash AND no document id (a fresh, direct visit to the create route,
 * bypassing the wizard), redirects to the wizard first. Both decisions are
 * pure functions from `pageWizardStash.ts`, unit tested there — this
 * component is just the React/form-context wiring around them, which (like
 * `Editor.client.tsx`) has no practical unit-test harness in this codebase
 * and is verified live instead.
 */
const PageWizardBootstrap = () => {
  const router = useRouter();
  const { id } = useDocumentInfo();
  const { dispatchFields, initializing } = useForm();
  const applied = React.useRef(false);

  React.useEffect(() => {
    // The form's own field state (including every field-level `defaultValue`,
    // e.g. builder's subscription default from field.ts) finishes populating
    // asynchronously after mount; dispatching our UPDATEs before that settles
    // gets silently clobbered by it. Wait for `initializing` to flip false.
    if (initializing || applied.current) return;
    applied.current = true;

    let stash: PageWizardStash | null = null;
    try {
      const raw = window.sessionStorage.getItem(PAGE_WIZARD_STASH_KEY);
      if (raw) {
        stash = JSON.parse(raw) as PageWizardStash;
        window.sessionStorage.removeItem(PAGE_WIZARD_STASH_KEY);
      }
    } catch {
      /* sessionStorage unavailable — treat as no stash */
    }

    if (stash) {
      // The Edit view's own `<Form initialState={...}>` fetches its default
      // field state asynchronously and, the moment `initializing` flips to
      // false, dispatches a full REPLACE_STATE from it (Form/index.js) — an
      // effect that, as our ancestor, commits AFTER ours in the same React
      // pass and would silently wipe out an UPDATE dispatched inline here.
      // Deferring past the current commit (a macrotask) lets that
      // REPLACE_STATE settle first, so ours applies on top of it, not under it.
      const applyStash = stash;
      setTimeout(() => {
        for (const { path, value } of stashToFieldUpdates(applyStash)) {
          dispatchFields({ type: "UPDATE", path, value, valid: true, initialValue: value } as never);
        }
      }, 0);
      return;
    }

    if (shouldRedirectToWizard({ hasStash: false, hasDocId: id != null })) {
      router.replace(WIZARD_PATH);
    }
  }, [initializing, id, dispatchFields, router]);

  return null;
};

export default PageWizardBootstrap;
