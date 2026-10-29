import { describe, expect, it, vi } from "vitest";

import { pagesCustomCodeGuard } from "../src/hooks/pages-custom-code-guard";

const REFUSED = "Seul un administrateur peut ajouter ou modifier un bloc de code personnalisé.";
const DUPLICATE = "Un bloc de code personnalisé figure deux fois dans la page : supprimez le doublon.";

/**
 * 014-custom-code-editing, FR-018 / research R6 — only an admin introduces a
 * « Code personnalisé » block; editors may move or delete existing ones.
 */
const admin = { id: 1, role: "admin", isActive: true };
const editor = { id: 2, role: "editor", isActive: true };
const block = (id: string) => `<div data-block="custom-code" data-code-id="${id}"></div>`;

function call(opts: {
  html?: string;
  user: object;
  operation?: "create" | "update";
  stored?: string[];
  blocks?: { codeId: string }[];
  language?: string;
}) {
  const findByID = vi.fn().mockResolvedValue({ customCode: { blocks: (opts.stored ?? []).map((codeId) => ({ codeId })) } });
  const data: Record<string, unknown> = { builder: opts.html === undefined ? {} : { html: opts.html } };
  if (opts.blocks) data.customCode = { blocks: opts.blocks };
  const run = pagesCustomCodeGuard({
    data,
    originalDoc: opts.operation === "create" ? undefined : { id: 42 },
    operation: opts.operation ?? "update",
    req: { user: opts.user, payload: { findByID }, i18n: { language: opts.language ?? "fr" } },
  } as never);
  return { run, data, findByID };
}

describe("pagesCustomCodeGuard (014, FR-018)", () => {
  it("refuses an editor introducing an unknown code block", async () => {
    await expect(call({ user: editor, html: block("a") + block("forged"), stored: ["a"] }).run).rejects.toThrow(REFUSED);
  });

  it("refuses in the member's language", async () => {
    await expect(call({ user: editor, html: block("forged"), language: "en" }).run).rejects.toThrow("Only an administrator can add or change a custom code block.");
    await expect(call({ user: admin, html: block("a") + block("a"), language: "en" }).run).rejects.toThrow("A custom code block is on the page twice: delete the copy.");
  });

  it("reads the stored rows with full access (the editor's own read omits them)", async () => {
    const { run, findByID } = call({ user: editor, html: block("a"), stored: ["a"] });
    await run;
    expect(findByID).toHaveBeenCalledWith(expect.objectContaining({ id: 42, overrideAccess: true }));
  });

  it("lets an editor keep, move or delete existing blocks", async () => {
    await expect(call({ user: editor, html: `<p>x</p>${block("b")}${block("a")}`, stored: ["a", "b"] }).run).resolves.toBeDefined();
    await expect(call({ user: editor, html: "<p>plus de bloc</p>", stored: ["a", "b"] }).run).resolves.toBeDefined();
  });

  it("refuses an editor creating a page that references code blocks (e.g. a duplicate)", async () => {
    await expect(call({ user: editor, operation: "create", html: block("a") }).run).rejects.toThrow(REFUSED);
  });

  it("ignores writes that don't touch the page HTML", async () => {
    const { run, findByID } = call({ user: editor });
    await expect(run).resolves.toBeDefined();
    expect(findByID).not.toHaveBeenCalled();
  });

  it("lets an admin add blocks and drops rows no longer referenced", async () => {
    const { run, data } = call({
      user: admin,
      html: block("keep") + block("new"),
      blocks: [{ codeId: "keep" }, { codeId: "gone" }, { codeId: "new" }],
    });
    await run;
    expect((data.customCode as { blocks: { codeId: string }[] }).blocks.map((b) => b.codeId)).toEqual(["keep", "new"]);
  });

  it("leaves the rows alone when an admin write doesn't carry them", async () => {
    const { run, data } = call({ user: admin, html: block("x") });
    await run;
    expect(data).not.toHaveProperty("customCode");
  });

  it("refuses the same block twice, whoever saves", async () => {
    await expect(call({ user: admin, html: block("a") + block("a") }).run).rejects.toThrow(DUPLICATE);
    await expect(call({ user: editor, html: block("a") + block("a"), stored: ["a"] }).run).rejects.toThrow(DUPLICATE);
  });

  it("treats an inactive admin as a non-admin", async () => {
    await expect(call({ user: { ...admin, isActive: false }, html: block("new") }).run).rejects.toThrow(REFUSED);
  });
});
