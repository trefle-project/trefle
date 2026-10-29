import { beforeEach, describe, expect, it, vi } from "vitest";

const writeActivity = vi.fn();
vi.mock("../src/lib/activity", () => ({ writeActivity: (...a: unknown[]) => writeActivity(...a) }));

import { changedCodeParts, pageActivity } from "../src/hooks/pages-activity";

/**
 * 014-custom-code-editing, FR-023 — a change to a page's scripts or code
 * blocks is recorded with who made it; nothing is recorded otherwise.
 */
const admin = { id: 1, role: "admin" };
const editor = { id: 2, role: "editor" };
const base = { id: 7, path: "/offre", domain: 3, status: "draft" };

const run = (previousDoc: object, doc: object, user: object | null, operation: "create" | "update" = "update") =>
  pageActivity({ doc, previousDoc, req: { user, payload: {} }, operation } as never);

const codeCalls = () => writeActivity.mock.calls.filter((c) => c[1].type === "page-code-changed");

beforeEach(() => writeActivity.mockReset());

describe("changedCodeParts", () => {
  it("ignores absent-vs-empty code, a default consent, and row ids", () => {
    expect(changedCodeParts(undefined, { head: { code: "", consent: "consent" }, blocks: [] })).toEqual([]);
    expect(
      changedCodeParts(
        { blocks: [{ id: "r1", codeId: "a", code: "x", consent: null }] } as never,
        { blocks: [{ id: "r2", codeId: "a", code: "x", consent: "consent" }] } as never,
      ),
    ).toEqual([]);
  });

  it("names each part that changed", () => {
    expect(
      changedCodeParts(
        { head: { code: "a" }, bodyEnd: { code: "b", consent: "consent" } },
        { head: { code: "a2" }, bodyEnd: { code: "b", consent: "essential" }, blocks: [{ codeId: "n", code: "" }] },
      ),
    ).toEqual(["head", "bodyEnd", "blocks"]);
  });
});

describe("pageActivity — page-code-changed (014)", () => {
  it("records the admin who changed the page code, with the parts changed", () => {
    run({ ...base, customCode: { head: { code: "" } } }, { ...base, customCode: { head: { code: "<script>p()</script>" } } }, admin);
    expect(codeCalls()).toHaveLength(1);
    expect(codeCalls()[0]![1]).toMatchObject({
      type: "page-code-changed",
      actor: 1,
      targetType: "page",
      targetId: "7",
      meta: { path: "/offre", domainId: 3, parts: ["head"] },
    });
  });

  it("records nothing when the code didn't change", () => {
    const cc = { head: { code: "<script>p()</script>", consent: "consent" } };
    run({ ...base, customCode: cc }, { ...base, title: "new", customCode: cc }, admin);
    expect(codeCalls()).toHaveLength(0);
  });

  it("never attributes a code change to an editor (they can't change it)", () => {
    run({ ...base }, { ...base, customCode: { head: { code: "<script>p()</script>" } } }, editor);
    expect(codeCalls()).toHaveLength(0);
  });

  it("records code set at creation by an admin", () => {
    run({}, { ...base, customCode: { bodyEnd: { code: "<script>q()</script>" } } }, admin, "create");
    expect(codeCalls()[0]![1].meta.parts).toEqual(["bodyEnd"]);
  });

  it("still records publication alongside", () => {
    run(
      { ...base, customCode: {} },
      { ...base, status: "published", customCode: { head: { code: "x" } } },
      admin,
    );
    expect(writeActivity.mock.calls.map((c) => c[1].type).sort()).toEqual(["page-code-changed", "page-published"]);
  });
});
