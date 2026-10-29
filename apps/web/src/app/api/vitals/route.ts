import { log } from "../../../lib/log";

const KNOWN = new Set(["LCP", "CLS", "INP", "FCP", "TTFB", "FID"]);

/**
 * T095 — receives the Web Vitals beacon and emits one aggregate log line per
 * metric. No URL, no identifiers beyond the metric's own random id.
 */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown> | undefined;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }

  const name = typeof body?.name === "string" ? body.name : "";
  if (KNOWN.has(name)) {
    log.info("web_vital", {
      metric: name,
      value: Number(body?.value) || 0,
      rating: typeof body?.rating === "string" ? body.rating : undefined,
    });
  }
  return new Response(null, { status: 204 });
}
