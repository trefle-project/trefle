import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage, BetaUsage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import fixtureIR from "./fixtures/import-ir.fixture.json";
import fixtureWire from "./fixtures/import-wire.fixture.json";
import {
  RATES_USD_PER_MTOK,
  SYSTEM_PROMPT,
  conversionConfigured,
  systemPrompt,
  convertPage,
  costUsd,
  makeConvert,
  type CreateMessage,
  type Tile,
} from "../src/lib/import/convert";
import { ImportError } from "../src/lib/import/errors";

/**
 * 012-url-page-import (T028) — the conversion step, with an injected fake SDK
 * call: fixture mode, cost from `usage`, stop reasons and API errors mapped
 * to import error codes, and what the request carries (FR-026).
 */
const EXTRACT = {
  url: "https://exemple.fr/",
  viewport: { width: 1440, height: 900 },
  texts: [{ id: "t1", tag: "h1", html: "Bonjour", box: { x: 0, y: 0, width: 100, height: 40 }, style: {} }],
  images: [],
  forms: [],
  unsupported: [],
  fonts: ["Inter"],
};
const TILES: Tile[] = [
  { device: "desktop", index: 0, width: 1440, top: 0, png: Buffer.from("desktop-png") },
  { device: "mobile", index: 0, width: 390, top: 0, png: Buffer.from("mobile-png") },
];
const input = { extract: EXTRACT, tiles: TILES };

const usage = (u: Partial<BetaUsage> = {}): BetaUsage =>
  ({
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_creation: null,
    iterations: null,
    ...u,
  }) as BetaUsage;

const message = (m: Partial<BetaMessage> = {}): BetaMessage =>
  ({
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    // What the model returns: the wire format (one CSS-like string per element).
    content: [{ type: "text", text: JSON.stringify(fixtureWire), citations: null }],
    stop_reason: "end_turn",
    stop_details: null,
    stop_sequence: null,
    usage: usage({ input_tokens: 1_000_000, output_tokens: 100_000 }),
    ...m,
  }) as BetaMessage;

const fake = (impl: () => Promise<BetaMessage>) => vi.fn<CreateMessage>(impl);

beforeEach(() => {
  vi.stubEnv("IMPORT_AI_MODE", "");
  vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
  vi.stubEnv("IMPORT_AI_MODEL", "");
  vi.stubEnv("IMPORT_AI_EFFORT", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("fixture mode", () => {
  it("returns the canned IR, free, without calling the SDK", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    const create = fake(async () => message());
    const out = await makeConvert(create)(input);
    expect(create).not.toHaveBeenCalled();
    expect(out.costUsd).toBe(0);
    expect(out.aiModel).toBe("fixture");
    expect(out.ir.sections.length).toBeGreaterThan(0);
  });

  it("is the default export's behaviour too", async () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    expect((await convertPage(input)).aiModel).toBe("fixture");
  });
});

describe("conversionConfigured (feature flag input)", () => {
  it("is on in fixture mode, or with an API key", () => {
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(conversionConfigured()).toBe(true);
    vi.stubEnv("IMPORT_AI_MODE", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-test");
    expect(conversionConfigured()).toBe(true);
  });

  it("is off without a key outside fixture mode, and the conversion refuses to run", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "  ");
    expect(conversionConfigured()).toBe(false);
    const create = fake(async () => message());
    await expect(makeConvert(create)(input)).rejects.toMatchObject({ code: "ai-unavailable" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("real conversion", () => {
  it("returns the parsed IR, the serving model and the cost", async () => {
    const out = await makeConvert(fake(async () => message()))(input);
    // The wire output is converted into the structured IR the serializer uses.
    expect(out.ir).toEqual(fixtureIR);
    expect(out.aiModel).toBe("claude-opus-5");
    // 1M input at $5 + 100k output at $25/M
    expect(out.costUsd).toBeCloseTo(5 + 2.5, 6);
  });

  it("sends model, effort, adaptive thinking, the IR format and default fallbacks", async () => {
    vi.stubEnv("IMPORT_AI_MODEL", "claude-opus-5-5");
    vi.stubEnv("IMPORT_AI_EFFORT", "high");
    const create = fake(async () => message());
    await makeConvert(create)(input);
    const [body, options] = create.mock.calls[0]!;
    expect(body.model).toBe("claude-opus-5-5");
    expect(body.thinking).toEqual({ type: "adaptive" });
    expect(body.output_config?.effort).toBe("high");
    expect(body.output_config?.format?.type).toBe("json_schema");
    expect(body.fallbacks).toBe("default");
    expect(body.betas).toEqual(["server-side-fallback-2026-07-01"]);
    expect(options.timeout).toBeGreaterThan(0);
  });

  it("falls back to effort medium when IMPORT_AI_EFFORT is not a known level", async () => {
    vi.stubEnv("IMPORT_AI_EFFORT", "turbo");
    const create = fake(async () => message());
    await makeConvert(create)(input);
    expect(create.mock.calls[0]![0].output_config?.effort).toBe("medium");
  });

  it("passes the job's AbortSignal to the SDK and lets an abort through untouched", async () => {
    const controller = new AbortController();
    const aborted = new Anthropic.APIUserAbortError();
    const create = fake(async () => {
      controller.abort("cancel");
      throw aborted;
    });
    await expect(makeConvert(create)({ ...input, signal: controller.signal })).rejects.toBe(aborted);
    expect(create.mock.calls[0]![1].signal).toBe(controller.signal);
  });

  it("maps a refusal (after fallbacks) to ai-refused, keeping what it cost", async () => {
    const create = fake(async () =>
      message({
        stop_reason: "refusal",
        stop_details: { type: "refusal", category: "cyber", explanation: null } as BetaMessage["stop_details"],
        content: [],
        usage: usage({ input_tokens: 200_000 }),
      }),
    );
    const err = await makeConvert(create)(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err).toMatchObject({ code: "ai-refused", spent: { aiModel: "claude-opus-5" } });
    expect((err as ImportError).spent!.costUsd).toBeCloseTo(1, 6);
  });

  it("repairs out-of-list values instead of failing the import", async () => {
    const slipped = structuredClone(fixtureWire) as { sections: { rows: { kind: string; blocks?: { kind: string; parts?: { as: string }[] }[] }[] }[] };
    const richText = slipped.sections[1]!.rows[0] as unknown as { columns: { blocks: { parts: { as: string }[] }[] }[] };
    richText.columns[0]!.blocks[0]!.parts[0]!.as = "h5";
    (slipped.sections[2]!.rows[0]!.blocks as unknown[]).push({ kind: "map", place: "Nantes" });
    const out = await makeConvert(fake(async () => message({ content: [{ type: "text", text: JSON.stringify(slipped), citations: null }] })))(input);
    const firstPart = (out.ir.sections[1]!.rows[0] as { columns: { blocks: { parts: { as: string }[] }[] }[] }).columns[0]!.blocks[0]!.parts[0]!;
    expect(firstPart.as).toBe("h4");
    expect(out.ir.omitted).toContainEqual({ what: "Bloc « map » non reconnu", reason: "other" });
  });

  it.each([
    ["max_tokens", message({ stop_reason: "max_tokens", content: [{ type: "text", text: '{"sections":[', citations: null }] })],
    ["unparsable output", message({ content: [{ type: "text", text: "not json", citations: null }] })],
    ["output not matching the IR", message({ content: [{ type: "text", text: '{"sections":"x"}', citations: null }] })],
    ["no text block", message({ content: [] })],
  ])("maps %s to ai-invalid, keeping what it cost", async (_, response) => {
    const err = await makeConvert(fake(async () => response))(input).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: "ai-invalid" });
    expect((err as ImportError).spent!.costUsd).toBeGreaterThan(0);
  });

  it.each([
    ["rate limit", new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers())],
    ["server error", new Anthropic.InternalServerError(529, undefined, "overloaded", new Headers())],
    ["bad key", new Anthropic.AuthenticationError(401, undefined, "bad key", new Headers())],
    ["connection", new Anthropic.APIConnectionError({ message: "ECONNRESET" })],
  ])("maps an API error (%s) to ai-unavailable, with no cost", async (_, error) => {
    const err = await makeConvert(
      fake(async () => {
        throw error;
      }),
    )(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ImportError);
    expect(err).toMatchObject({ code: "ai-unavailable" });
    expect((err as ImportError).spent).toBeUndefined();
  });

  it("the French prompt is byte for byte the one measured before 023; English differs only in the report's language (T053)", async () => {
    expect(createHash("sha256").update(SYSTEM_PROMPT).digest("hex")).toBe("6c4a29fd64d5b0063d9b9b6ab6c240b67f4a5ae4cb471fc5ad40792d1873b71f");
    expect(systemPrompt("fr")).toBe(SYSTEM_PROMPT);
    const fr = SYSTEM_PROMPT.split("\n");
    const en = systemPrompt("en").split("\n");
    expect(en).toHaveLength(fr.length);
    const changed = fr.flatMap((line, i) => (line === en[i] ? [] : [i]));
    expect(changed.map((i) => fr[i]!.slice(0, 2))).toEqual(["3.", "6."]);
    expect(en[changed[0]!]).toContain("(what, and how it was simplified), in English, one short line each");
    expect(en[changed[1]!]).toBe('6. "source" on each section is a short English label of what it is ("Main banner", "Three benefits", "Testimonial", "Final call to action"…).');

    const create = fake(async () => message());
    await makeConvert(create)({ ...input, reportLanguage: "en" });
    expect(create.mock.calls[0]![0].system).toEqual([{ type: "text", text: systemPrompt("en"), cache_control: { type: "ephemeral" } }]);
  });

  it("sends only the frozen system prompt, the labelled tiles and the page extract (FR-026)", async () => {
    const create = fake(async () => message());
    await makeConvert(create)(input);
    const [body] = create.mock.calls[0]!;

    expect(Object.keys(body).sort()).toEqual(
      ["betas", "fallbacks", "max_tokens", "messages", "model", "output_config", "system", "thinking"].sort(),
    );
    expect(body.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    // The one user message is exactly: label + tile per tile, then the extract. Nothing else of the CMS.
    const png = (t: Tile) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: t.png.toString("base64") } });
    expect(body.messages).toEqual([
      {
        role: "user",
        content: [
          { type: "text", text: "desktop rendering, 1440 px wide — tile 1, page y 0 px and below" },
          png(TILES[0]!),
          { type: "text", text: "mobile rendering, 390 px wide — tile 1, page y 0 px and below" },
          png(TILES[1]!),
          { type: "text", text: `Page extract (JSON):\n${JSON.stringify(EXTRACT)}` },
        ],
      },
    ]);
  });

  it("keeps the system prompt byte-identical between requests, so it stays cached", async () => {
    const create = fake(async () => message());
    const convert = makeConvert(create);
    await convert(input);
    await convert({ ...input, extract: { ...EXTRACT, url: "https://autre.fr/" } });
    expect(JSON.stringify(create.mock.calls[0]![0].system)).toBe(JSON.stringify(create.mock.calls[1]![0].system));
  });
});

describe("costUsd", () => {
  const opus = RATES_USD_PER_MTOK["claude-opus-5"]!;

  it("prices input, 5-minute and 1-hour cache writes, cache reads and output", () => {
    const u = usage({
      input_tokens: 100_000,
      cache_creation_input_tokens: 30_000,
      cache_creation: { ephemeral_5m_input_tokens: 20_000, ephemeral_1h_input_tokens: 10_000 },
      cache_read_input_tokens: 50_000,
      output_tokens: 20_000,
    });
    const expected =
      (100_000 * opus.input + 20_000 * opus.input * 1.25 + 10_000 * opus.input * 2 + 50_000 * opus.cacheRead + 20_000 * opus.output) /
      1e6;
    expect(costUsd(u, "claude-opus-5", "claude-opus-5")).toBeCloseTo(expected, 9);
  });

  it("treats cache writes without a TTL breakdown as 5-minute writes", () => {
    const u = usage({ cache_creation_input_tokens: 1_000_000 });
    expect(costUsd(u, "claude-opus-5", "claude-opus-5")).toBeCloseTo(opus.input * 1.25, 9);
  });

  it("bills an unknown model at the highest known rate", () => {
    const u = usage({ input_tokens: 1_000_000, output_tokens: 1_000_000 });
    const rates = Object.values(RATES_USD_PER_MTOK);
    const top = Math.max(...rates.map((r) => r.input)) + Math.max(...rates.map((r) => r.output));
    expect(costUsd(u, "claude-future-9", "claude-future-9")).toBeCloseTo(top, 9);
  });

  it("with fallbacks, sums every attempt from usage.iterations at its own model's rate", () => {
    const opus48 = RATES_USD_PER_MTOK["claude-opus-4-8"]!;
    const u = usage({
      input_tokens: 999, // top-level covers only the serving attempt: ignored when iterations exist
      output_tokens: 999,
      iterations: [
        { type: "message", model: null, input_tokens: 100_000, output_tokens: 1_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
        { type: "fallback_message", model: "claude-opus-4-8", input_tokens: 100_000, output_tokens: 10_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null },
      ] as BetaUsage["iterations"],
    });
    const expected = (100_000 * opus.input + 1_000 * opus.output + 100_000 * opus48.input + 10_000 * opus48.output) / 1e6;
    expect(costUsd(u, "claude-opus-5", "claude-opus-4-8")).toBeCloseTo(expected, 9);
  });
});
