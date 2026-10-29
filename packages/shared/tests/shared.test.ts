import { describe, expect, it } from "vitest";

import { PAGE_LIST_TAG, domainTag, leadIntakeSchema, pageTag } from "../src/index";

describe("@trefle/shared", () => {
  it("builds cache tags", () => {
    expect(pageTag("abc")).toBe("page:abc");
    expect(domainTag("d1")).toBe("domain:d1");
    expect(PAGE_LIST_TAG).toBe("page-list");
  });

  it("rejects a lead intake payload without active consent", () => {
    const result = leadIntakeSchema.safeParse({
      pageId: "p1",
      email: "a@b.com",
      consent: false,
      consentContext: {
        consentText: "x",
        purposeText: "y",
        privacyNoticeUrl: "z",
        privacyNoticeVersion: "1",
        capturedAt: "now",
        ip: "1.1.1.1",
        userAgent: "ua",
      },
      metadata: { pageUrl: "u" },
    });
    expect(result.success).toBe(false);
  });
});
