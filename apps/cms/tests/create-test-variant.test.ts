import { describe, expect, it, vi } from "vitest";

import { createTestVariantEndpoint } from "../src/endpoints/createTestVariant";

const admin = { id: "u1", role: "admin", isActive: true };

const sourcePage = {
  id: 180,
  title: "manualtest",
  status: "published",
  pageType: "subscription",
  language: 1,
  experimentOf: null,
  builder: { html: "<h1>x</h1>", css: "", blockCount: { total: 1, byType: { hero: 1 }, leadForm: 0 } },
  form: {
    fields: [
      { id: "6aaa511bafc4697196eae872", name: "email", label: "Email", type: "email", required: true },
      {
        id: "6aaa511bafc4697196eae999",
        name: "choice",
        label: "Choix",
        type: "select",
        options: [{ id: "opt1", label: "A", value: "a" }],
      },
    ],
  },
  seo: {},
  customCode: {
    head: { code: "<script>pixel()</script>", consent: "consent" },
    bodyEnd: { code: null, consent: "consent" },
    blocks: [{ id: "row1", codeId: "c-1", code: "<div id='cal'></div>", consent: "essential" }],
  },
};

function makeReq(user: unknown, routeParams: Record<string, string>, findByID: unknown, create = vi.fn()) {
  return {
    user,
    routeParams,
    payload: { findByID: vi.fn().mockResolvedValue(findByID), create },
  } as never;
}

describe("createTestVariantEndpoint (008-ab-testing, FR-001/FR-003)", () => {
  it("copies builder/form/seo, sets experimentOf, leaves domain/path unset, starts as draft", async () => {
    const create = vi.fn().mockResolvedValue({ id: 190, title: "manualtest (variant)" });
    const req = makeReq(admin, { id: "180" }, sourcePage, create);
    const res = await createTestVariantEndpoint.handler!(req);
    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "pages",
        data: expect.objectContaining({
          experimentOf: 180,
          status: "draft",
          builder: sourcePage.builder,
          seo: sourcePage.seo,
        }),
        overrideAccess: true,
      }),
    );
    expect(create.mock.calls[0]![0].data).not.toHaveProperty("domain");
    expect(create.mock.calls[0]![0].data).not.toHaveProperty("path");
  });

  // Regression: found live — creating a variant failed with "Value must be
  // unique, path: id, tableName: pages" because `form.fields`' own row ids
  // (and each field's `options` row ids) were copied verbatim from the
  // source page and collided at create time.
  it("strips array-row ids from form.fields (and nested options) before creating", async () => {
    const create = vi.fn().mockResolvedValue({ id: 192, title: "manualtest (variant)" });
    const req = makeReq(admin, { id: "180" }, sourcePage, create);
    await createTestVariantEndpoint.handler!(req);
    const sentForm = create.mock.calls[0]![0].data.form;
    expect(sentForm.fields).toHaveLength(2);
    for (const field of sentForm.fields) {
      expect(field).not.toHaveProperty("id");
      for (const option of field.options ?? []) expect(option).not.toHaveProperty("id");
    }
    // Non-id data survives the strip untouched.
    expect(sentForm.fields[0]).toMatchObject({ name: "email", type: "email" });
    expect(sentForm.fields[1].options[0]).toMatchObject({ label: "A", value: "a" });
  });

  // 014-custom-code-editing, FR-006 — a variant carries the control's page
  // scripts and code blocks (row ids stripped, like form.fields).
  it("copies customCode, stripping its array-row ids", async () => {
    const create = vi.fn().mockResolvedValue({ id: 193, title: "manualtest (variant)" });
    await createTestVariantEndpoint.handler!(makeReq(admin, { id: "180" }, sourcePage, create));
    const sent = create.mock.calls[0]![0].data.customCode;
    expect(sent.head).toEqual({ code: "<script>pixel()</script>", consent: "consent" });
    expect(sent.blocks).toEqual([{ codeId: "c-1", code: "<div id='cal'></div>", consent: "essential" }]);
  });

  it("is repeatable: a second call on the same source is not rejected by this endpoint", async () => {
    const create = vi.fn().mockResolvedValue({ id: 191, title: "manualtest (variant)" });
    const req = makeReq(admin, { id: "180" }, sourcePage, create);
    const res = await createTestVariantEndpoint.handler!(req);
    expect(res.status).toBe(201);
  });

  it("rejects an unpublished source page", async () => {
    const req = makeReq(admin, { id: "180" }, { ...sourcePage, status: "draft" });
    await expect(createTestVariantEndpoint.handler!(req)).rejects.toThrow(/Only a published page/);
  });

  it("rejects creating a variant of a variant", async () => {
    const req = makeReq(admin, { id: "182" }, { ...sourcePage, id: 182, experimentOf: 180 });
    await expect(createTestVariantEndpoint.handler!(req)).rejects.toThrow(/cannot itself have variants/);
  });

  it("404s when the source page doesn't exist", async () => {
    const req = makeReq(admin, { id: "999" }, null);
    const res = await createTestVariantEndpoint.handler!(req);
    expect(res.status).toBe(404);
  });

  it("rejects a non-staff caller with 403", async () => {
    const req = makeReq(null, { id: "180" }, sourcePage);
    const res = await createTestVariantEndpoint.handler!(req);
    expect(res.status).toBe(403);
  });
});
