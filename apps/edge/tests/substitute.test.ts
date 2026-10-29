import { NONCE_PLACEHOLDER, formTokenPlaceholder } from "@trefle/shared";
import { describe, expect, it } from "vitest";

import { newNonce, substitute } from "../src/substitute";

const encoder = new TextEncoder();

/** A stream of `bytes` cut at the given byte offsets. */
function streamOf(bytes: Uint8Array, cuts: number[] = []): ReadableStream<Uint8Array> {
  const bounds = [0, ...cuts, bytes.length];
  return new ReadableStream({
    start(controller) {
      for (let i = 0; i < bounds.length - 1; i++) controller.enqueue(bytes.slice(bounds[i], bounds[i + 1]));
      controller.close();
    },
  });
}

async function run(
  input: string | Uint8Array,
  cuts: number[] = [],
  tokenFor: (id: string) => string | Promise<string> = (id) => `tok-${id}`,
) {
  const bytes = typeof input === "string" ? encoder.encode(input) : input;
  const { stream, pageId } = substitute(streamOf(bytes, cuts), { nonce: "N".repeat(32), tokenFor });
  const out = new Uint8Array(await new Response(stream).arrayBuffer());
  return { out, text: new TextDecoder().decode(out), pageId: await pageId };
}

const PAGE =
  `<html><head><meta name="tf-page" content="12"/>` +
  `<script nonce="${NONCE_PLACEHOLDER}">x</script></head><body>` +
  `<input type="hidden" name="formToken" value="${formTokenPlaceholder("12")}"/>` +
  `<script nonce="${NONCE_PLACEHOLDER}">self.__next_f.push([1,"{\\"formToken\\":\\"${formTokenPlaceholder("12")}\\"}"])</script>` +
  `</body></html>`;
const EXPECTED = PAGE.replaceAll(NONCE_PLACEHOLDER, "N".repeat(32)).replaceAll(formTokenPlaceholder("12"), "tok-12");

describe("substitute (contracts/edge-worker.md §4)", () => {
  it("replaces every placeholder, including inside a JSON-escaped RSC string, and captures the page id", async () => {
    const { text, pageId } = await run(PAGE);
    expect(text).toBe(EXPECTED);
    expect(text).not.toMatch(/TFEDGE/);
    expect(pageId).toBe("12");
  });

  it("gives the same result whatever byte the stream is cut at", async () => {
    const bytes = encoder.encode(PAGE);
    for (let cut = 1; cut < bytes.length; cut++) {
      const { text, pageId } = await run(bytes, [cut]);
      expect(text, `cut at ${cut}`).toBe(EXPECTED);
      expect(pageId, `cut at ${cut}`).toBe("12");
    }
  });

  it("survives a stream cut into single bytes", async () => {
    const bytes = encoder.encode(PAGE);
    const { text } = await run(bytes, Array.from({ length: bytes.length - 1 }, (_, i) => i + 1));
    expect(text).toBe(EXPECTED);
  });

  it("signs one token per page id, reused for every occurrence", async () => {
    const calls: string[] = [];
    const html = `${formTokenPlaceholder("1")} ${formTokenPlaceholder("2")} ${formTokenPlaceholder("1")}`;
    const { text } = await run(html, [], (id) => {
      calls.push(id);
      return Promise.resolve(`t${id}`);
    });
    expect(text).toBe("t1 t2 t1");
    expect(calls.sort()).toEqual(["1", "2"]);
  });

  it("leaves bytes unchanged when there is no placeholder, and reports no page id", async () => {
    const bytes = encoder.encode("<html><body>Déjà vu — 日本語 ✓ 🌿</body></html>");
    const { out, pageId } = await run(bytes, [20, 21, 22, 40]);
    expect(out).toEqual(bytes);
    expect(pageId).toBeNull();
  });

  it("keeps multi-byte characters split across chunks intact next to a placeholder", async () => {
    const html = `é${NONCE_PLACEHOLDER}🌿`;
    const bytes = encoder.encode(html);
    for (let cut = 1; cut < bytes.length; cut++) {
      const { text } = await run(bytes, [cut]);
      expect(text).toBe(`é${"N".repeat(32)}🌿`);
    }
  });

  it("captures the page id when the meta tag is split across chunks", async () => {
    const html = `<head>${"x".repeat(100)}<meta name="tf-page" content="4567"/></head>`;
    const bytes = encoder.encode(html);
    for (let cut = 100; cut < bytes.length; cut++) {
      expect((await run(bytes, [cut])).pageId).toBe("4567");
    }
  });
});

describe("newNonce", () => {
  it("is 32 lowercase hex chars and differs every time", () => {
    const a = newNonce();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(newNonce()).not.toBe(a);
  });
});
