import { log } from "./log";

/**
 * T094 (FR-037, FR-038) — unhandled-error capture for the renderer.
 *
 * What leaves the process to the configurable sink (`ERROR_SINK_URL`):
 * error **name**, Next error **digest**, **route**, **release**, and a coarse
 * **user-agent class** — never the error message, stack, request body, or any
 * personal data. The full message/stack is written only to this process's own
 * stderr for the operator. With no sink configured the sink call is skipped
 * (no-op beyond the local log) — the dev default.
 */
export type ErrorSource = "server" | "client";

export interface ErrorContext {
  source: ErrorSource;
  route?: string;
  digest?: string;
  uaClass?: string;
}

export function uaClass(ua: string | null | undefined): "bot" | "mobile" | "desktop" | "unknown" {
  if (!ua) return "unknown";
  if (/bot|crawl|spider|slurp|preview/i.test(ua)) return "bot";
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return "mobile";
  return "desktop";
}

export async function reportError(err: unknown, ctx: ErrorContext): Promise<void> {
  const name = err instanceof Error && err.name ? err.name : "Error";
  const message = err instanceof Error ? err.message : String(err);

  // Non-personal envelope for the external sink.
  const envelope = {
    app: "web",
    release: process.env.RELEASE ?? "dev",
    source: ctx.source,
    route: ctx.route?.slice(0, 200),
    digest: ctx.digest,
    uaClass: ctx.uaClass,
    name,
    at: new Date().toISOString(),
  };

  // Operator-only detail stays on local stderr.
  log.error("unhandled_error", { ...envelope, message });

  const sink = process.env.ERROR_SINK_URL;
  if (!sink) return;
  try {
    await fetch(sink, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope),
      signal: AbortSignal.timeout(2000),
    });
  } catch (e) {
    log.warn("error sink unreachable", { sinkError: String(e) });
  }
}
