import { NONCE_PLACEHOLDER } from "@trefle/shared";

/**
 * 020-edge-html-cache, contracts/edge-worker.md §4 — replaces the renderer's
 * placeholders in a cached page with this visit's values, while streaming:
 *
 * - every `TFEDGENONCE…` → `nonce` (one value per response);
 * - every `TFEDGEFT<pageId>X` → `tokenFor(pageId)` (one token per page id);
 * - the first `<meta name="tf-page" content="<id>">` gives the page id for view
 *   counting (left in the output).
 *
 * Text is decoded as UTF-8; the last `CARRY` characters of each chunk are held
 * back until the next one, so a placeholder split across two chunks is still
 * found (every pattern is shorter than `CARRY`).
 */
const PLACEHOLDER_RE = new RegExp(`${NONCE_PLACEHOLDER}|TFEDGEFT(\\d{1,15})X`, "g");
const PAGE_META_RE = /<meta name="tf-page" content="(\d{1,15})"/;
/** Longer than the longest pattern (the page meta with a 15-digit id: 47). */
const CARRY = 64;

export interface SubstituteOptions {
  nonce: string;
  tokenFor: (pageId: string) => string | Promise<string>;
}

export function substitute(
  body: ReadableStream<Uint8Array>,
  { nonce, tokenFor }: SubstituteOptions,
): { stream: ReadableStream<Uint8Array>; pageId: Promise<string | null> } {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const tokens = new Map<string, Promise<string>>();
  let held = "";
  let pageIdFound = false;
  let resolvePageId: (id: string | null) => void = () => {};
  const pageId = new Promise<string | null>((resolve) => (resolvePageId = resolve));

  /** Replaces the placeholders in `text[0, cutoff)` — extended to the end of a
   * placeholder that straddles it — and keeps the rest for later. */
  async function process(text: string, final: boolean): Promise<string> {
    if (!pageIdFound) {
      const meta = PAGE_META_RE.exec(text);
      if (meta) {
        pageIdFound = true;
        resolvePageId(meta[1]!);
      }
    }
    let cutoff = final ? text.length : Math.max(0, text.length - CARRY);
    const matches = [...text.matchAll(PLACEHOLDER_RE)].filter((m) => m.index < cutoff);
    const last = matches.at(-1);
    if (last) cutoff = Math.max(cutoff, last.index + last[0].length);

    for (const m of matches) {
      const id = m[1];
      if (id && !tokens.has(id)) tokens.set(id, Promise.resolve(tokenFor(id)));
    }
    const resolved = new Map<string, string>();
    for (const [id, token] of tokens) resolved.set(id, await token);

    held = text.slice(cutoff);
    return text.slice(0, cutoff).replace(PLACEHOLDER_RE, (match, id: string | undefined) =>
      id ? resolved.get(id)! : nonce,
    );
  }

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    async transform(chunk, controller) {
      const out = await process(held + decoder.decode(chunk, { stream: true }), false);
      if (out) controller.enqueue(encoder.encode(out));
    },
    async flush(controller) {
      const out = await process(held + decoder.decode(), true);
      if (out) controller.enqueue(encoder.encode(out));
      if (!pageIdFound) resolvePageId(null);
    },
  });

  return { stream: body.pipeThrough(transform), pageId };
}

/** A fresh CSP nonce: 32 lowercase hex chars from 16 random bytes. */
export function newNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
