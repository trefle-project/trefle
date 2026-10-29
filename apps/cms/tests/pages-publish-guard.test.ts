import { describe, expect, it, vi } from "vitest";

import { publishGuard } from "../src/hooks/pages-publish-guard";

const noClash = { payload: { find: vi.fn().mockResolvedValue({ totalDocs: 0 }) } };

const validForm = {
  fields: [
    { name: "email", label: "Email", type: "email", required: true },
    { name: "firstName", label: "Prénom", type: "text", required: true },
  ],
  successMessage: "Merci",
  consentPurposeText: "But",
  privacyNoticeUrl: "/p",
  privacyNoticeVersion: "1",
};

const call = (data: Record<string, unknown>, originalDoc: Record<string, unknown> | undefined = undefined) =>
  publishGuard({ data, originalDoc, req: noClash } as never);

describe("publishGuard (T033, FR-002a/FR-003)", () => {
  it("passes a well-formed publish and stamps publishedAt", async () => {
    const out = (await call({
      status: "published",
      domain: "d1",
      path: "/",
      builder: { blockCount: { leadForm: 1 }, html: "<section>x</section>" },
      form: validForm,
    })) as { publishedAt?: string };
    expect(out.publishedAt).toBeTypeOf("string");
  });

  it("does nothing for a draft save", async () => {
    const out = await call({ status: "draft" });
    expect(out).toEqual({ status: "draft" });
  });

  it("rejects zero lead-form blocks", async () => {
    await expect(
      call({ status: "published", domain: "d1", path: "/", builder: { blockCount: { leadForm: 0 }, html: "x" }, form: validForm }),
    ).rejects.toThrow(/exactly one lead-form block/);
  });

  it("rejects two lead-form blocks", async () => {
    await expect(
      call({ status: "published", domain: "d1", path: "/", builder: { blockCount: { leadForm: 2 }, html: "x" }, form: validForm }),
    ).rejects.toThrow(/exactly one lead-form block/);
  });

  describe("016 — lead form inside a carousel", () => {
    const publish = (blockCount: Record<string, number>) =>
      call({ status: "published", domain: "d1", path: "/", builder: { blockCount, html: "<section>x</section>" }, form: validForm });

    it("rejects a lead-form block inside a carousel", async () => {
      await expect(publish({ leadForm: 1, leadFormInCarousel: 1 })).rejects.toThrow(/cannot be placed inside a carousel/);
    });

    it("publishes when no lead form is inside a carousel", async () => {
      await expect(publish({ leadForm: 1, leadFormInCarousel: 0 })).resolves.toBeDefined();
    });

    it("publishes a page counted before 016 (no leadFormInCarousel key)", async () => {
      await expect(publish({ leadForm: 1 })).resolves.toBeDefined();
    });
  });

  it("rejects a missing domain / path", async () => {
    await expect(
      call({ status: "published", builder: { blockCount: { leadForm: 1 }, html: "x" }, form: validForm }),
    ).rejects.toThrow(/assign the page to a domain/);
  });

  it("rejects a form without exactly one email field", async () => {
    const form = { ...validForm, fields: [{ name: "firstName", label: "Prénom", type: "text" }] };
    await expect(
      call({ status: "published", domain: "d1", path: "/", builder: { blockCount: { leadForm: 1 }, html: "x" }, form }),
    ).rejects.toThrow(/exactly one email field/);
  });

  // 003-post-launch-improvements, FR-013 — confirmationPage is never a publish
  // requirement; a page with none set must publish exactly like before.
  it("publishes a page with no confirmationPage set", async () => {
    const out = (await call({
      status: "published",
      domain: "d1",
      path: "/",
      builder: { blockCount: { leadForm: 1 }, html: "<section>x</section>" },
      form: validForm,
    })) as { publishedAt?: string; confirmationPage?: unknown };
    expect(out.publishedAt).toBeTypeOf("string");
    expect(out.confirmationPage).toBeUndefined();
  });

  // 004-page-types, FR-004/FR-007 — free pages: no lead-form block allowed,
  // no form-configuration requirements.
  describe("pageType: free", () => {
    it("publishes with zero lead-form blocks and no form config", async () => {
      const out = (await call({
        status: "published",
        pageType: "free",
        domain: "d1",
        path: "/a-propos",
        builder: { blockCount: { leadForm: 0 }, html: "<section>x</section>" },
        form: {},
      })) as { publishedAt?: string };
      expect(out.publishedAt).toBeTypeOf("string");
    });

    it("rejects a lead-form block", async () => {
      await expect(
        call({
          status: "published",
          pageType: "free",
          domain: "d1",
          path: "/a-propos",
          builder: { blockCount: { leadForm: 1 }, html: "x" },
          form: {},
        }),
      ).rejects.toThrow(/must not contain a lead-form block \(found 1\)/);
    });

    it("does not require an email field or consent/privacy settings", async () => {
      const out = (await call({
        status: "published",
        pageType: "free",
        domain: "d1",
        path: "/a-propos",
        builder: { blockCount: { leadForm: 0 }, html: "x" },
        form: { fields: [] },
      })) as { publishedAt?: string };
      expect(out.publishedAt).toBeTypeOf("string");
    });
  });

  // 004-page-types, FR-005/FR-006 — confirmation pages: no lead-form block
  // (shared with `free`, already covered above) plus the unsubscribe-link
  // placeholder is mandatory to publish.
  describe("pageType: confirmation", () => {
    it("publishes with the placeholder and zero lead-form blocks", async () => {
      const out = (await call({
        status: "published",
        pageType: "confirmation",
        domain: "d1",
        path: "/merci",
        builder: { blockCount: { leadForm: 0 }, html: "<p>Merci ! {{unsubscribeUrl}}</p>" },
        form: {},
      })) as { publishedAt?: string };
      expect(out.publishedAt).toBeTypeOf("string");
    });

    it("rejects a page missing the unsubscribe-link placeholder", async () => {
      await expect(
        call({
          status: "published",
          pageType: "confirmation",
          domain: "d1",
          path: "/merci",
          builder: { blockCount: { leadForm: 0 }, html: "<p>Merci !</p>" },
          form: {},
        }),
      ).rejects.toThrow(/unsubscribe-link placeholder/);
    });

    it("rejects a lead-form block even with the placeholder present", async () => {
      await expect(
        call({
          status: "published",
          pageType: "confirmation",
          domain: "d1",
          path: "/merci",
          builder: { blockCount: { leadForm: 1 }, html: "<p>Merci ! {{unsubscribeUrl}}</p>" },
          form: {},
        }),
      ).rejects.toThrow(/must not contain a lead-form block \(found 1\)/);
    });
  });

  it("rejects when another published page already uses the path", async () => {
    const req = { payload: { find: vi.fn().mockResolvedValue({ totalDocs: 1 }) } };
    await expect(
      publishGuard({
        data: { status: "published", domain: "d1", path: "/promo", builder: { blockCount: { leadForm: 1 }, html: "x" }, form: validForm },
        originalDoc: { id: "p9", status: "draft" },
        req,
      } as never),
    ).rejects.toThrow(/already uses \/promo/);
  });

  // 008-ab-testing, data-model.md — a test variant (`experimentOf` set) is
  // never resolved by its own URL, so it publishes with no domain/path and
  // never trips the (domain, path) clash check.
  describe("experimentOf (test variant)", () => {
    it("publishes with no domain/path when experimentOf is set", async () => {
      const out = (await call({
        status: "published",
        experimentOf: "p1",
        builder: { blockCount: { leadForm: 1 }, html: "<section>x</section>" },
        form: validForm,
      })) as { publishedAt?: string };
      expect(out.publishedAt).toBeTypeOf("string");
    });

    it("still rejects a missing domain/path for an ordinary page (regression)", async () => {
      await expect(
        call({ status: "published", builder: { blockCount: { leadForm: 1 }, html: "x" }, form: validForm }),
      ).rejects.toThrow(/assign the page to a domain/);
    });

    it("two ordinary pages still collide on (domain, path) exactly as before this feature (regression)", async () => {
      const req = { payload: { find: vi.fn().mockResolvedValue({ totalDocs: 1 }) } };
      await expect(
        publishGuard({
          data: { status: "published", domain: "d1", path: "/promo", builder: { blockCount: { leadForm: 1 }, html: "x" }, form: validForm },
          originalDoc: { id: "p9", status: "draft" },
          req,
        } as never),
      ).rejects.toThrow(/already uses \/promo/);
    });
  });
});
