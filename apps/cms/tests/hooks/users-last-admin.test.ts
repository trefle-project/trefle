import { describe, expect, it, vi } from "vitest";

import {
  lastAdminGuardBeforeChange,
  lastAdminGuardBeforeDelete,
} from "../../src/hooks/users-last-admin";

/** payload stub whose `count` reports how many OTHER active admins exist. */
function makePayload(otherActiveAdmins: number, doc?: Record<string, unknown>) {
  return {
    count: vi.fn().mockResolvedValue({ totalDocs: otherActiveAdmins }),
    findByID: vi.fn().mockResolvedValue(doc ?? null),
    logger: { warn: vi.fn() },
  };
}

const adminDoc = { id: 1, role: "admin", isActive: true };

describe("lastAdminGuardBeforeChange (T081 / US5-4)", () => {
  it("rejects demoting the only active Administrator", async () => {
    const payload = makePayload(0);
    await expect(
      lastAdminGuardBeforeChange({
        data: { role: "editor" },
        originalDoc: adminDoc,
        operation: "update",
        req: { payload },
      } as never),
    ).rejects.toThrow(/last active Administrator/i);
  });

  it("rejects deactivating the only active Administrator", async () => {
    const payload = makePayload(0);
    await expect(
      lastAdminGuardBeforeChange({
        data: { isActive: false },
        originalDoc: adminDoc,
        operation: "update",
        req: { payload },
      } as never),
    ).rejects.toThrow(/last active Administrator/i);
  });

  it("allows demoting an Administrator when another active one remains", async () => {
    const payload = makePayload(1);
    const data = { role: "editor" };
    await expect(
      lastAdminGuardBeforeChange({
        data,
        originalDoc: adminDoc,
        operation: "update",
        req: { payload },
      } as never),
    ).resolves.toBe(data);
    expect(payload.count).toHaveBeenCalledOnce();
  });

  it("is a no-op for an unrelated field edit on an Administrator (no count query)", async () => {
    const payload = makePayload(0);
    const data = { name: "New Name" };
    await lastAdminGuardBeforeChange({
      data,
      originalDoc: adminDoc,
      operation: "update",
      req: { payload },
    } as never);
    expect(payload.count).not.toHaveBeenCalled();
  });

  it("ignores creates and non-admin originals", async () => {
    const payload = makePayload(0);
    await lastAdminGuardBeforeChange({
      data: { role: "admin" },
      originalDoc: undefined,
      operation: "create",
      req: { payload },
    } as never);
    await lastAdminGuardBeforeChange({
      data: { isActive: false },
      originalDoc: { id: 2, role: "editor", isActive: true },
      operation: "update",
      req: { payload },
    } as never);
    expect(payload.count).not.toHaveBeenCalled();
  });
});

describe("lastAdminGuardBeforeDelete (T081 / US5-5)", () => {
  it("rejects deleting the last active Administrator", async () => {
    const payload = makePayload(0, adminDoc);
    await expect(
      lastAdminGuardBeforeDelete({ id: 1, req: { payload } } as never),
    ).rejects.toThrow(/last active Administrator/i);
  });

  it("allows deleting an Administrator when another active one remains", async () => {
    const payload = makePayload(1, adminDoc);
    await expect(
      lastAdminGuardBeforeDelete({ id: 1, req: { payload } } as never),
    ).resolves.toBeUndefined();
  });

  it("does not guard the deletion of an Editor", async () => {
    const payload = makePayload(0, { id: 2, role: "editor", isActive: true });
    await lastAdminGuardBeforeDelete({ id: 2, req: { payload } } as never);
    expect(payload.count).not.toHaveBeenCalled();
  });
});
