import { ValidationError } from "payload";
import { afterEach, describe, expect, it, vi } from "vitest";

import { domainFontUsageEndpoint } from "../src/endpoints/domainFontUsage";
import { domainFontsBeforeChange } from "../src/hooks/domains-fonts";
import { ensureBucketCors, FONT_CORS_RULE } from "../src/lib/import/bucket-cors";
import {
  ensureFontFiles,
  FontError,
  fontErrorMessage,
  mergeFontRows,
  parseCss2,
  resolveGoogleFamily,
} from "../src/lib/fonts";

/** 015-penpot-site-import T038/T041 — domain fonts (User Story 4, research P8). */

const face = (subset: string, style: string, weight: number, file: string) => `/* ${subset} */
@font-face {
  font-family: 'EB Garamond';
  font-style: ${style};
  font-weight: ${weight};
  font-display: swap;
  src: url(https://fonts.gstatic.com/s/ebgaramond/v33/${file}.woff2) format('woff2');
  unicode-range: U+0000-00FF, U+0131;
}
`;
const CSS = [
  face("cyrillic", "normal", 400, "cyr"),
  face("latin-ext", "normal", 400, "ext400"),
  face("latin", "normal", 400, "lat400"),
  face("latin", "italic", 700, "lat700i"),
].join("");

/** Google answers 400 for an unknown family and for an unknown weight alike. */
function google(opts: { families?: string[]; weights?: number[]; down?: boolean } = {}) {
  const families = opts.families ?? ["EB Garamond"];
  const weights = opts.weights ?? [400, 700];
  return vi.fn(async (input: string | URL) => {
    const url = String(input);
    if (opts.down) throw new Error("ECONNREFUSED");
    if (url.startsWith("https://fonts.gstatic.com/"))
      return new Response(new Uint8Array([0x77, 0x4f, 0x46, 0x32, 1, 2, 3]), { status: 200 });
    const u = new URL(url);
    const [family, axes] = (u.searchParams.get("family") ?? "").split(":");
    if (!families.includes(family!)) return new Response("<html>", { status: 400 });
    const asked = (axes?.split("@")[1] ?? "")
      .split(";")
      .filter(Boolean)
      .map((t) => Number(t.split(",").pop()));
    if (asked.some((w) => !weights.includes(w))) return new Response("<html>", { status: 400 });
    return new Response(CSS, { status: 200 });
  });
}

function fakePayload(
  existing: { id: number; family: string; weight: number; style: string; subset: string }[] = [],
) {
  let next = 100;
  const created: Record<string, unknown>[] = [];
  return {
    created,
    find: vi.fn(
      async ({
        collection,
        where,
      }: {
        collection: string;
        where: { and: Record<string, { equals: unknown }>[] };
      }) => {
        if (collection !== "fonts") return { docs: [], totalDocs: 0 };
        const q = Object.assign(
          {},
          ...where.and.map((c) =>
            Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.equals])),
          ),
        );
        const docs = [...existing, ...(created as typeof existing)].filter(
          (d) =>
            d.family === q.family &&
            d.weight === q.weight &&
            d.style === q.style &&
            d.subset === q.subset,
        );
        return { docs, totalDocs: docs.length };
      },
    ),
    create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      const doc = { id: next++, ...data };
      created.push(doc);
      return doc;
    }),
  };
}

afterEach(() => vi.unstubAllEnvs());

describe("CSS2 parsing and resolution", () => {
  it("every face with its subset, style, weight, range and url", () => {
    const faces = parseCss2(CSS);
    expect(faces).toHaveLength(4);
    expect(faces[2]).toEqual({
      family: "EB Garamond",
      style: "normal",
      weight: 400,
      subset: "latin",
      unicodeRange: "U+0000-00FF, U+0131",
      url: "https://fonts.gstatic.com/s/ebgaramond/v33/lat400.woff2",
    });
  });
  it("keeps latin and latin-ext only; asks Google with a browser user agent and italic tuples", async () => {
    const fetchImpl = google();
    const faces = await resolveGoogleFamily(
      { family: "EB Garamond", weights: [400, 700], italic: true },
      fetchImpl as never,
    );
    expect(faces.map((f) => f.subset).sort()).toEqual(["latin", "latin", "latin-ext"]);
    const [url, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(
      "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400;0,700;1,400;1,700&display=swap",
    );
    expect((init.headers as Record<string, string>)["user-agent"]).toMatch(/Chrome/);
  });
  it("unknown family and unknown weight are told apart, in French (default) or English", async () => {
    const f1 = await resolveGoogleFamily(
      { family: "Garamont Pro", weights: [400], italic: false },
      google() as never,
    ).catch((e) => e);
    expect(f1).toBeInstanceOf(FontError);
    expect(fontErrorMessage(f1)).toBe("Police introuvable sur Google Fonts : Garamont Pro");
    const f2 = await resolveGoogleFamily(
      { family: "EB Garamond", weights: [400, 100], italic: false },
      google() as never,
    ).catch((e) => e);
    expect(f2.kind).toBe("weight");
    expect(fontErrorMessage(f2)).toBe("Graisse(s) indisponible(s) pour EB Garamond : 100");
    expect(fontErrorMessage(f1, "en")).toBe("Font not found on Google Fonts: Garamont Pro");
    expect(fontErrorMessage(f2, "en")).toBe("Weight(s) unavailable for EB Garamond: 100");
    const f3 = await resolveGoogleFamily(
      { family: "EB Garamond", weights: [400], italic: false },
      google({ down: true }) as never,
    ).catch((e) => e);
    expect(f3.kind).toBe("network");
  });
  it("refuses family names that could inject into a URL or CSS", async () => {
    const e = await resolveGoogleFamily(
      { family: "X&family=Roboto", weights: [400], italic: false },
      google() as never,
    ).catch((x) => x);
    expect(e.kind).toBe("family");
  });
});

describe("ensureFontFiles", () => {
  it("downloads and stores only missing files; a second call (another domain) downloads nothing", async () => {
    const payload = fakePayload([
      { id: 7, family: "EB Garamond", weight: 400, style: "normal", subset: "latin-ext" },
    ]);
    const fetchImpl = google();
    const ids = await ensureFontFiles(
      payload as never,
      { family: "EB Garamond", weights: [400, 700], italic: true },
      { fetchImpl: fetchImpl as never },
    );
    expect(ids).toHaveLength(3);
    expect(ids).toContain(7);
    expect(payload.created).toHaveLength(2);
    const doc = payload.create.mock.calls[0]![0] as unknown as {
      data: Record<string, unknown>;
      file: { name: string; mimetype: string };
    };
    expect(doc.file).toMatchObject({ name: "eb-garamond-400-latin.woff2", mimetype: "font/woff2" });
    expect(doc.data.sha256).toMatch(/^[0-9a-f]{64}$/);
    const downloads = () =>
      fetchImpl.mock.calls.filter(([u]) => String(u).includes("gstatic")).length;
    const before = downloads();
    await ensureFontFiles(
      payload as never,
      { family: "EB Garamond", weights: [400, 700], italic: true },
      { fetchImpl: fetchImpl as never },
    );
    expect(downloads()).toBe(before);
  });
  it("never downloads from another host than Google's font host (or a configured stand-in)", async () => {
    const evil = vi.fn(async (u: string | URL) =>
      String(u).includes("googleapis")
        ? new Response(CSS.replace(/https:\/\/fonts\.gstatic\.com/g, "http://cms:3000"), {
            status: 200,
          })
        : new Response("x"),
    );
    const e = await ensureFontFiles(
      fakePayload() as never,
      { family: "EB Garamond", weights: [400], italic: false },
      { fetchImpl: evil as never },
    ).catch((x) => x);
    expect(e.kind).toBe("network");
    expect(evil.mock.calls.some(([u]) => String(u).includes("cms:3000"))).toBe(false);
  });
});

describe("domain fonts hook", () => {
  const req = (payload: unknown, language = "fr") => ({ payload, i18n: { language } }) as never;
  it("merges rows of one family, resolves new rows, keeps files of unchanged rows", async () => {
    vi.stubGlobal("fetch", google());
    const payload = fakePayload();
    const out = (await domainFontsBeforeChange({
      data: {
        fonts: [
          { family: "Inter Tight", weights: ["400"], italic: false, files: [1, 2] },
          { family: "EB Garamond", weights: ["400"] },
          { family: "eb garamond", weights: ["700"], italic: true },
        ],
      },
      originalDoc: {
        fonts: [{ family: "Inter Tight", weights: ["400"], italic: false, files: [1, 2] }],
      },
      req: req(payload),
    } as never)) as {
      fonts: { family: string; weights: string[]; italic: boolean; files: number[] }[];
    };
    vi.unstubAllGlobals();
    expect(out.fonts.map((f) => f.family)).toEqual(["Inter Tight", "EB Garamond"]);
    expect(out.fonts[0]!.files).toEqual([1, 2]);
    expect(out.fonts[1]).toMatchObject({ weights: ["400", "700"], italic: true });
    expect(out.fonts[1]!.files.length).toBe(3);
  });
  it("an unknown family blocks saving, on that row's field", async () => {
    vi.stubGlobal("fetch", google());
    const err = await domainFontsBeforeChange({
      data: { fonts: [{ family: "Garamont Pro", weights: ["400"] }] },
      originalDoc: {},
      req: req(fakePayload()),
    } as never).catch((e: unknown) => e as ValidationError);
    vi.unstubAllGlobals();
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.data.errors).toEqual([
      { path: "fonts.0.family", message: "Police introuvable sur Google Fonts : Garamont Pro" },
    ]);
  });
});

describe("GET /api/domains/:id/font-usage", () => {
  const handler = domainFontUsageEndpoint.handler as (req: unknown) => Promise<Response>;
  const payload = {
    findByID: vi.fn(async () => ({
      id: 3,
      fonts: [{ family: "Inter Tight" }, { family: "EB Garamond" }],
    })),
    find: vi.fn(async () => ({
      docs: [
        { builder: { css: '#a{font-family:"Inter Tight", sans-serif;}' } },
        { builder: { css: "#b{font-family:'Inter Tight';}" } },
        { builder: { css: "#c{color:red}" } },
      ],
    })),
  };
  it("counts the domain's pages naming each family", async () => {
    const res = await handler({
      user: { id: 1, role: "admin", isActive: true },
      payload,
      routeParams: { id: "3" },
    });
    expect(await res.json()).toEqual({ "Inter Tight": 2, "EB Garamond": 0 });
  });
  it("admins only", async () => {
    expect(
      (
        await handler({
          user: { id: 2, role: "editor", isActive: true },
          payload,
          routeParams: { id: "3" },
        })
      ).status,
    ).toBe(403);
  });
});

describe("mergeFontRows", () => {
  it("sorts weights numerically and drops empty families", () => {
    expect(mergeFontRows([{ family: "A", weights: ["700", "100"] }, { family: " " }])).toEqual([
      { family: "A", weights: ["100", "700"] },
    ]);
  });
});

describe("bucket CORS", () => {
  it("sets the GET/HEAD any-origin rule once; does nothing when already there; never throws", async () => {
    const send = vi.fn(async (cmd: { constructor: { name: string } }) =>
      cmd.constructor.name === "GetBucketCorsCommand" ? { CORSRules: [] } : {},
    );
    await ensureBucketCors({} as never, { send } as never);
    const put = send.mock.calls.find(
      ([c]) => c.constructor.name === "PutBucketCorsCommand",
    )![0] as unknown as { input: { CORSConfiguration: unknown } };
    expect(put.input.CORSConfiguration).toEqual({ CORSRules: [FONT_CORS_RULE] });

    const already = vi.fn(async () => ({ CORSRules: [FONT_CORS_RULE] }));
    await ensureBucketCors({} as never, { send: already } as never);
    expect(already).toHaveBeenCalledTimes(1);

    const broken = vi.fn(async (cmd: { constructor: { name: string } }) => {
      if (cmd.constructor.name === "PutBucketCorsCommand") throw new Error("denied");
      return { CORSRules: [] };
    });
    await expect(
      ensureBucketCors({ logger: { warn: vi.fn() } } as never, { send: broken } as never),
    ).resolves.toBeUndefined();
  });
});
