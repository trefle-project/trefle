import { describe, expect, it, vi } from "vitest";

import { logTotpLockouts } from "../src/lib/totp-lockout-log";

/**
 * 019-admin-access — payload-totp locks through the database adapter, so the
 * wrapper around its code endpoints is what records `totp-locked`.
 */
const future = new Date(Date.now() + 600_000).toISOString();

const run = async (beforeLock: string | null, afterLock: string | null, path = "/verify-totp") => {
  const inner = vi.fn().mockResolvedValue(Response.json({ ok: false }));
  const config = logTotpLockouts({ endpoints: [{ path, method: "post", handler: inner }] } as never);
  const payload = {
    db: {
      findOne: vi
        .fn()
        .mockResolvedValueOnce(beforeLock ? { lockUntil: beforeLock } : null)
        .mockResolvedValueOnce(afterLock ? { lockUntil: afterLock } : null),
    },
    create: vi.fn().mockResolvedValue({}),
    logger: { warn: vi.fn() },
  };
  await (config.endpoints![0]!.handler as (r: unknown) => Promise<Response>)({ user: { id: 4 }, payload });
  return { inner, payload };
};

describe("logTotpLockouts", () => {
  it("logs totp-locked when a code leaves the member newly locked", async () => {
    const { inner, payload } = await run(null, future);
    expect(inner).toHaveBeenCalledOnce();
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ type: "totp-locked", targetId: "4", actor: null }) }),
    );
  });

  it("logs nothing for a wrong code below the limit, or a member already locked", async () => {
    expect((await run(null, null)).payload.create).not.toHaveBeenCalled();
    expect((await run(future, future)).payload.create).not.toHaveBeenCalled();
  });

  it("leaves other endpoints alone", async () => {
    const { payload } = await run(null, future, "/setup-totp");
    expect(payload.db.findOne).not.toHaveBeenCalled();
  });
});
