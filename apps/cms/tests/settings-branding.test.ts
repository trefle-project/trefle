import { describe, expect, it, vi } from "vitest";

import { reapplyBranding, variantSameSizeAsPattern } from "../src/hooks/settings-branding";
import { DEFAULT_IMAGES, applyBranding, readBranding, totpOptions, withBranding } from "../src/lib/branding";

/** 022-ux-improvement (US4, T034) — branding hooks. */
const req = (images: Record<string, { width: number; height: number }>, settings: Record<string, unknown> = {}, language = "fr") => ({
  i18n: { language },
  payload: {
    findByID: vi.fn(async ({ id }: { id: string }) => images[id]),
    findGlobal: vi.fn(async () => settings),
    config: { admin: { meta: { titleSuffix: " · Trefle", icons: [{ rel: "icon", url: "/payload.png" }] } } },
  },
});

describe("variantSameSizeAsPattern", () => {
  it("refuses a variant of another size, in the member's language", async () => {
    const r = req({ p: { width: 15, height: 15 }, v: { width: 30, height: 30 } });
    await expect(variantSameSizeAsPattern({ data: { adminPattern: "p", adminVariant: "v" }, req: r } as never)).rejects.toThrow("La variante doit avoir la même taille que le motif (15×15 px).");
    const en = req({ p: { width: 15, height: 15 }, v: { width: 30, height: 30 } }, {}, "en");
    await expect(variantSameSizeAsPattern({ data: { adminPattern: "p", adminVariant: "v" }, req: en } as never)).rejects.toThrow("The variant must be the same size as the pattern (15×15 px).");
  });

  it("accepts the same size, or no variant", async () => {
    const r = req({ p: { width: 15, height: 15 }, v: { width: 15, height: 15 } });
    await expect(variantSameSizeAsPattern({ data: { adminPattern: "p", adminVariant: "v" }, req: r } as never)).resolves.toBeTruthy();
    await expect(variantSameSizeAsPattern({ data: { adminPattern: "p" }, req: r } as never)).resolves.toBeTruthy();
  });
});

describe("withBranding / issuer", () => {
  it("the operator's name replaces « Trefle » in the tab title; the favicon follows the upload", () => {
    const meta = withBranding({ title: "Pages · Trefle", icons: [{ url: "/payload.png" }] }, { name: "Digital Media Group", favicon: { url: "https://assets/admin/fav.png", mimeType: "image/png", width: 32, height: 32 } });
    expect(meta.title).toBe("Pages · Digital Media Group");
    expect(meta.icons).toEqual([{ rel: "icon", url: "https://assets/admin/fav.png", type: "image/png" }]);
    expect(withBranding({ title: { default: "Admin · Trefle" } }, { name: null, favicon: null })).toEqual({ title: { default: "Admin · Trefle" } });
    expect(withBranding({ title: "X · Trefle", icons: ["keep"] }, { name: null, favicon: null }).icons).toEqual(["keep"]);
  });

  it("the 2FA issuer is the operator's name (after a save), else « Trefle »", async () => {
    const r = req({}, { operator: { name: "Digital Media Group" } });
    await reapplyBranding({ req: r } as never);
    expect(totpOptions.totp.issuer).toBe("Digital Media Group");
    applyBranding(r.payload as never, { name: null, logo: null, icon: null, favicon: null, pattern: null, variant: null, variantMode: "perScreen", variantCount: 1, variantOneIn: 1000, veilOpacity: 85 });
    expect(totpOptions.totp.issuer).toBe("Trefle");
  });
});

describe("readBranding / defaults", () => {
  const read = async (settings: Record<string, unknown>) => readBranding(req({}, settings).payload as never);

  it("the veil opacity is the Settings value, kept within 0–100, 60 when unset", async () => {
    expect((await read({ veilOpacity: 85 })).veilOpacity).toBe(85);
    expect((await read({ veilOpacity: 140 })).veilOpacity).toBe(100);
    expect((await read({ veilOpacity: -5 })).veilOpacity).toBe(0);
    expect((await read({})).veilOpacity).toBe(60);
  });

  it("empty Settings give Trefle's bundled look: clover images, variant 1 in 100", async () => {
    const b = await read({});
    expect(b.logo).toEqual(DEFAULT_IMAGES.logo);
    expect(b.icon).toEqual(DEFAULT_IMAGES.icon);
    expect(b.favicon).toEqual(DEFAULT_IMAGES.favicon);
    expect(b.pattern).toEqual(DEFAULT_IMAGES.pattern);
    expect(b.variant).toEqual(DEFAULT_IMAGES.variant);
    expect([b.variantMode, b.variantOneIn]).toEqual(["oneIn", 100]);
  });

  it("an uploaded pattern replaces the bundled one and drops the bundled variant (other size)", async () => {
    const b = await read({ adminPattern: { url: "https://assets/admin/p.png", width: 30, height: 30, mimeType: "image/png" } });
    expect(b.pattern?.url).toBe("https://assets/admin/p.png");
    expect(b.variant).toBeNull();
  });
});
