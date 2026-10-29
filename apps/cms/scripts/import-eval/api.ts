/**
 * Shared by the import-evaluation scripts (012-url-page-import T070, see
 * .claude/skills/trefle-import-eval): talk to the LOCAL cms REST API as the
 * dev admin. Never point these scripts at production.
 */
export const CMS_API = process.env.EVAL_CMS_API ?? "http://localhost:3000/api";

let token: string | null = null;

export async function login(): Promise<void> {
  const res = await fetch(`${CMS_API}/users/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      email: process.env.EVAL_ADMIN_EMAIL ?? "admin@trefle.localhost",
      password: process.env.EVAL_ADMIN_PASSWORD ?? "trefle-dev-123",
    }),
  });
  const body = (await res.json()) as { token?: string };
  if (!body.token) throw new Error(`login failed (${res.status})`);
  token = body.token;
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> {
  if (!token) await login();
  const res = await fetch(`${CMS_API}${path}`, {
    ...init,
    headers: {
      authorization: `JWT ${token}`,
      // 023 (T053): the AI writes its report lines in the launcher's admin
      // language. French, so runs stay comparable with the ones before 023.
      cookie: "payload-lng=fr",
      // A multipart body (saved-page import) sets its own content type.
      ...(init.body instanceof FormData ? {} : { "content-type": "application/json" }),
      ...(init.headers ?? {}),
    },
  });
  return { status: res.status, body: (await res.json().catch(() => null)) as T };
}

/** Result of one evaluated import, as written to `<out>/results.json`. */
export type EvalResult = {
  label: string;
  url: string;
  importId: number;
  status: string;
  errorCode: string | null;
  seconds: number;
  steps: { step: string | null; at: number }[];
  costEur: number | null;
  costUsd: number | null;
  aiModel: string | null;
  page: number | null;
  report: unknown;
};

/** `--name value` from argv, else the default. */
export function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
}

/** Positional `label=url` pairs from argv (options and their values skipped). */
export function pairs(): { label: string; url: string }[] {
  const out: { label: string; url: string }[] = [];
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i]!.startsWith("--")) {
      i++;
      continue;
    }
    const eq = args[i]!.indexOf("=");
    if (eq > 0) out.push({ label: args[i]!.slice(0, eq), url: args[i]!.slice(eq + 1) });
  }
  return out;
}
