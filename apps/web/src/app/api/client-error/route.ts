import { reportError, uaClass } from "../../../lib/error-report";

/**
 * T094 — receives the client error boundary's beacon. Accepts only the
 * non-personal fields it needs and drops the rest.
 */
export async function POST(req: Request): Promise<Response> {
  let body: Record<string, unknown> | undefined;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return new Response(null, { status: 204 });
  }

  const name = typeof body?.name === "string" ? body.name.slice(0, 100) : "ClientError";
  const digest = typeof body?.digest === "string" ? body.digest.slice(0, 64) : undefined;
  const route = typeof body?.route === "string" ? body.route.slice(0, 200) : undefined;

  await reportError(Object.assign(new Error(name), { name }), {
    source: "client",
    route,
    digest,
    uaClass: uaClass(req.headers.get("user-agent")),
  });

  return new Response(null, { status: 204 });
}
