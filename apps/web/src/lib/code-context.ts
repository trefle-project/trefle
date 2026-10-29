import { headers } from "next/headers";

import type { CodeContext } from "./custom-code";

/**
 * 014-custom-code-editing — the per-request context PageShell needs to emit
 * a page's admin code: the CSP nonce middleware.ts generated for this very
 * request. Every route rendering a page is dynamic (it reads the Host header
 * or is `force-dynamic`), so the nonce is always this request's — never a
 * cached one. Kept out of custom-code.tsx so that module stays importable in
 * tests without Next's request scope.
 */
export async function codeContext(preview = false): Promise<CodeContext> {
  return { nonce: (await headers()).get("x-nonce") ?? "", preview };
}
