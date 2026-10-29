import { afterEach, describe, expect, it, vi } from "vitest";

import { log, leadSubmissionLog } from "../src/lib/log";

/** Capture the single JSON line the logger writes. */
function capture(fn: () => void): Record<string, unknown> {
  const spy = vi.spyOn(console, "log").mockImplementation(() => {});
  const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  fn();
  const line = (spy.mock.calls[0] ?? errSpy.mock.calls[0] ?? warnSpy.mock.calls[0])?.[0] as string;
  spy.mockRestore();
  errSpy.mockRestore();
  warnSpy.mockRestore();
  return JSON.parse(line) as Record<string, unknown>;
}

afterEach(() => vi.restoreAllMocks());

describe("log redactor (T089 / FR-038)", () => {
  it("redacts personal keys, case- and separator-insensitive, at any depth", () => {
    const out = capture(() =>
      log.info("x", {
        email: "a@b.c",
        hp_check: "bot@x.y",
        ipAddress: "1.2.3.4",
        "user-agent": "Mozilla",
        fieldValues: { firstName: "Jo" },
        Authorization: "Bearer z",
        metadata: { referrer: "https://x" },
        name: "Jo Doe",
        body: "raw",
        nested: [{ consentPurposeText: "..." }],
      }),
    );
    expect(out.email).toBe("[redacted]");
    expect(out.hp_check).toBe("[redacted]");
    expect(out.ipAddress).toBe("[redacted]");
    expect(out["user-agent"]).toBe("[redacted]");
    expect(out.fieldValues).toBe("[redacted]");
    expect(out.Authorization).toBe("[redacted]");
    expect(out.metadata).toBe("[redacted]");
    expect(out.name).toBe("[redacted]");
    expect(out.body).toBe("[redacted]");
    expect((out.nested as { consentPurposeText: string }[])[0]!.consentPurposeText).toBe("[redacted]");
  });

  it("keeps non-personal operational fields intact", () => {
    const out = capture(() =>
      log.info("revalidated", { tags: ["page:1"], reason: "page-published", pageId: "7", counter: "abuse_rejected_timing", value: 3 }),
    );
    expect(out.tags).toEqual(["page:1"]);
    expect(out.reason).toBe("page-published");
    expect(out.pageId).toBe("7");
    expect(out.counter).toBe("abuse_rejected_timing");
    expect(out.value).toBe(3);
  });

  it("lead_submission line carries only outcome/reason/pageId", () => {
    const out = capture(() => leadSubmissionLog({ outcome: "rejected", reason: "consent_required", pageId: "7" }));
    expect(out).toMatchObject({ msg: "lead_submission", outcome: "rejected", reason: "consent_required", pageId: "7" });
    expect(Object.keys(out)).not.toContain("email");
  });
});
