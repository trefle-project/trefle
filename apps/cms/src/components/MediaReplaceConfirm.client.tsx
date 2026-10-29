"use client";

import {
  ConfirmationModal,
  FormSubmit,
  useDocumentInfo,
  useEditDepth,
  useForm,
  useFormFields,
  useFormModified,
  useHotkey,
  useModal,
  useOperation,
  useTranslation,
} from "@payloadcms/ui";
import React from "react";

import { useAdminText } from "../i18n/useAdminText";
import type { MediaUsage } from "../lib/media-usage";
import { fetchMediaUsage, UsageList } from "./MediaUsageList.client";

/**
 * 017-edge-protection (FR-021, contracts/media-usage.md) — the media save
 * button. Saving a **new file** over an image that pages use first asks
 * « Remplacer partout » / « Annuler »; a failed lookup asks too (fail safe).
 * Any other save (e.g. the description) goes straight through. Otherwise the
 * same as Payload's own SaveButton (disabled state, Ctrl/Cmd+S).
 */
const MODAL_SLUG = "media-replace-confirm";

export default function MediaReplaceConfirm() {
  const { id, uploadStatus } = useDocumentInfo();
  const { t } = useTranslation();
  const { t: text } = useAdminText();
  const { submit } = useForm();
  const modified = useFormModified();
  const editDepth = useEditDepth();
  const operation = useOperation();
  const { openModal } = useModal();
  const file = useFormFields(([fields]) => fields.file?.value);
  const ref = React.useRef<HTMLButtonElement>(null);
  const [usage, setUsage] = React.useState<MediaUsage | null>(null);
  const [checking, setChecking] = React.useState(false);

  const disabled = (operation === "update" && !modified) || uploadStatus === "uploading" || checking;
  const newFile = typeof File !== "undefined" && file instanceof File;

  useHotkey({ cmdCtrlKey: true, editDepth, keyCodes: ["s"] }, (e) => {
    e.preventDefault();
    e.stopPropagation();
    ref.current?.click();
  });

  const handleSubmit = async () => {
    if (uploadStatus === "uploading") return;
    if (operation !== "update" || !id || !newFile) return void submit();
    setChecking(true);
    const found = await fetchMediaUsage(id).catch(() => null);
    setChecking(false);
    if (found && found.total === 0) return void submit();
    setUsage(found);
    openModal(MODAL_SLUG);
  };

  return (
    <>
      <FormSubmit buttonId="action-save" disabled={disabled} onClick={() => void handleSubmit()} ref={ref} size="medium" type="button">
        {t("general:save")}
      </FormSubmit>
      <ConfirmationModal
        modalSlug={MODAL_SLUG}
        heading={text("media.replaceHeading")}
        confirmLabel={text("media.replaceEverywhere")}
        cancelLabel={text("common.cancel")}
        body={
          <div data-testid="media-replace-confirm">
            {usage ? (
              <>
                <p>{text("media.replaceUsedIn")}</p>
                <UsageList usage={usage} />
              </>
            ) : (
              <p>{text("media.replaceUnknown")}</p>
            )}
            <p>{text("media.replaceNote")}</p>
          </div>
        }
        onConfirm={() => void submit()}
      />
    </>
  );
}
