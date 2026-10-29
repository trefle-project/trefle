import { beforeEach, describe, expect, it, vi } from "vitest";

const { revalidateTags, warn } = vi.hoisted(() => ({ revalidateTags: vi.fn(), warn: vi.fn() }));
vi.mock("../src/hooks/revalidate", () => ({ revalidateTags }));
vi.mock("../src/lib/log", () => ({ log: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { experimentsRevalidate } from "../src/hooks/experiments-revalidate";

/**
 * 008 + 020-edge-html-cache (contracts/purge.md) — a test starting or stopping
 * revalidates the renderer's A/B lookups and the control page's domain, so the
 * edge drops that domain's cached pages and nothing else.
 */
const findByID = vi.fn();
const req = { payload: { findByID } } as never;
const run = (doc: object, previousDoc?: object) =>
  experimentsRevalidate({ doc, previousDoc, req } as never);
const sentTags = () => revalidateTags.mock.calls[0]![0].tags as string[];

beforeEach(() => vi.clearAllMocks());

describe("experimentsRevalidate", () => {
  it("adds the domain of a populated control page", async () => {
    await run({ status: "running", controlPage: { id: 5, domain: 3 } }, { status: "draft" });
    expect(sentTags()).toEqual(["ab-tests", "ab-test:5", "domain:3"]);
    expect(findByID).not.toHaveBeenCalled();
  });

  it("looks the control page up (depth 0) when only its id is known", async () => {
    findByID.mockResolvedValue({ id: 5, domain: 7 });
    await run({ status: "concluded", controlPage: 5 }, { status: "running" });
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ collection: "pages", id: "5", depth: 0 }));
    expect(sentTags()).toEqual(["ab-tests", "ab-test:5", "domain:7"]);
  });

  it("accepts a populated domain object", async () => {
    await run({ status: "running", controlPage: { id: 5, domain: { id: 9 } } }, { status: "draft" });
    expect(sentTags()).toContain("domain:9");
  });

  it("falls back to html (purge everything) when the domain cannot be found", async () => {
    findByID.mockRejectedValue(new Error("not found"));
    await run({ status: "running", controlPage: 5 }, { status: "draft" });
    expect(sentTags()).toEqual(["ab-tests", "ab-test:5", "html"]);
    expect(warn).toHaveBeenCalled();
  });

  it("sends nothing when the test neither starts nor stops", async () => {
    await run({ status: "draft", controlPage: 5 }, { status: "draft" });
    expect(revalidateTags).not.toHaveBeenCalled();
  });
});
