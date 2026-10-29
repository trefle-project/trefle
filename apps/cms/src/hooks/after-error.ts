import type { AfterErrorHook } from "payload";

import { log } from "../lib/log";

/**
 * T094 (FR-037, FR-038) — config-level error capture for the CMS. Sends a
 * non-personal envelope (error name, request path, collection slug, release)
 * to `ERROR_SINK_URL` when set; otherwise writes one local `error` line.
 * The response is left as Payload built it, except for `keepErrorDetails`.
 */
export const afterError: AfterErrorHook = ({ error, req, collection, result }) => {
  let path: string | undefined;
  try {
    path = req?.url ? new URL(req.url, "http://cms").pathname : undefined;
  } catch {
    path = undefined;
  }

  const envelope = {
    app: "cms",
    release: process.env.RELEASE ?? "dev",
    path,
    collection: collection?.slug,
    name: error?.name ?? "Error",
    at: new Date().toISOString(),
  };

  log.error("unhandled_error", { ...envelope, message: error?.message });
  sendToErrorSink(envelope);
  return keepErrorDetails(error, result);
};

/**
 * Payload sends a validation error's per-field messages (`data.errors`) only
 * when `error instanceof ValidationError`. Next can load `payload` twice in
 * the production build (it depends on how the code is split into chunks), and
 * then an error thrown by our own hooks — e.g. « Police introuvable sur
 * Google Fonts » — reaches the admin as « The following field is invalid »
 * with no field message. Put the details back whenever a client error
 * carries them and the response lost them; server errors (5xx) stay hidden.
 */
export function keepErrorDetails(error: unknown, result: unknown): { response: Record<string, unknown>; status: number } | undefined {
  const e = error as { data?: unknown; message?: string; name?: string; status?: number } | null;
  if (!e?.data || typeof e.status !== "number" || e.status < 400 || e.status >= 500) return undefined;
  const first = (result as { errors?: { data?: unknown }[] } | undefined)?.errors?.[0];
  if (first?.data) return undefined;
  return { response: { errors: [{ name: e.name, data: e.data, message: e.message }] }, status: e.status };
}

/**
 * POSTs a non-personal envelope to `ERROR_SINK_URL` when set (fire and
 * forget). Also used by the page import job, which fails outside a request.
 */
export function sendToErrorSink(envelope: Record<string, unknown>): void {
  const sink = process.env.ERROR_SINK_URL;
  if (!sink) return;
  void fetch(sink, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(2000),
  }).catch((e) => log.warn("error sink unreachable", { sinkError: String(e) }));
}
