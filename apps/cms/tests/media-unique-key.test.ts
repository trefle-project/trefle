import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { mediaUniqueKey, uniqueKeyName } from "../src/hooks/media-unique-key";

/**
 * 017-edge-protection (T033, FR-013) — uploaded files get a never-reused key,
 * so the edge can cache them as immutable.
 */
const hash8 = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 8);

const run = async (operation: string, file: { name: string; data: Buffer } | undefined) => {
  const args = { req: { file } };
  await mediaUniqueKey({ args, operation } as never);
  return args.req.file?.name;
};

describe("media unique key", () => {
  const photo = Buffer.from("photo bytes");

  it("suffixes the name with the first 8 hex chars of the SHA-256", () => {
    expect(uniqueKeyName("photo.jpg", photo)).toBe(`photo-${hash8(photo)}.jpg`);
  });

  it("renames the incoming file on create and on update with a file", async () => {
    expect(await run("create", { name: "photo.jpg", data: photo })).toBe(`photo-${hash8(photo)}.jpg`);
    expect(await run("update", { name: "photo.jpg", data: photo })).toBe(`photo-${hash8(photo)}.jpg`);
  });

  it("leaves operations without a file alone", async () => {
    expect(await run("update", undefined)).toBeUndefined();
    expect(await run("read", { name: "photo.jpg", data: photo })).toBe("photo.jpg");
  });

  it("names fonts the same way (the fonts/ prefix is the storage plugin's)", () => {
    const woff = Buffer.from("woff2");
    expect(uniqueKeyName("inter-400-latin.woff2", woff)).toBe(`inter-400-latin-${hash8(woff)}.woff2`);
  });

  it("gives identical content the same suffix (Payload's safe-name still de-duplicates the key)", () => {
    expect(uniqueKeyName("a.png", photo)).toBe(uniqueKeyName("a.png", photo));
  });

  it("replaces an import-style hash suffix instead of appending a second one", () => {
    const webp = Buffer.from("final webp");
    expect(uniqueKeyName("logo-ab12cd34.webp", webp)).toBe(`logo-${hash8(webp)}.webp`);
  });

  it("keeps names without an extension", () => {
    expect(uniqueKeyName("README", photo)).toBe(`README-${hash8(photo)}`);
  });
});
