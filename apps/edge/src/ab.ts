import { assignVariant, parseAbMarker } from "@trefle/shared";

/**
 * 020-edge-html-cache, contracts/edge-worker.md §3, amended by 018 (research
 * R15, 2026-10-20) — which version a view gets, decided at the edge from the
 * marker the origin answers for a path under test
 * (`<experimentKey>;<id>,<id>…;<domainId>`, control first).
 *
 * Cookieless: the version is drawn for every view through the shared
 * `assignVariant`, fed with the view number (the random salt of this
 * response's form token). Nothing is read from or written to the visitor's
 * device, so a reload may show the other version.
 */
export interface AbDecision {
  variantId: string;
  experimentKey: string;
  domainId: string;
}

/** Null when the marker cannot even give the control page: the origin then serves the request as today. */
export function decideVariant(markerValue: string | null, viewNumber: string): AbDecision | null {
  const marker = parseAbMarker(markerValue);
  if (!marker) {
    // Unparsable marker: the control page (first id) if it can be read.
    const control = markerValue?.split(";")[1]?.split(",")[0];
    return control && /^\d+$/.test(control) ? { variantId: control, experimentKey: "", domainId: "" } : null;
  }
  const { experimentKey, variantIds, domainId } = marker;
  return { variantId: assignVariant(viewNumber, experimentKey, variantIds), experimentKey, domainId };
}
