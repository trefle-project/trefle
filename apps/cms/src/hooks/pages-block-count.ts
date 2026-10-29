import type { CollectionBeforeValidateHook } from "payload";

import { countBlocks } from "@trefle/shared";

/**
 * T032 — recompute `builder.blockCount` from `builder.projectData` on every
 * save so the publish guard (T033) and the admin have an accurate tally.
 */
export const recomputeBlockCount: CollectionBeforeValidateHook = ({ data }) => {
  if (!data) return data;
  const builder = (data.builder ?? {}) as Record<string, unknown>;
  builder.blockCount = countBlocks(builder.projectData);
  data.builder = builder;
  return data;
};
