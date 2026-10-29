import { describe, expect, it, vi } from "vitest";

import { resetTotp } from "../src/lib/totp-reset";

/**
 * 019-admin-access (T009) — the reset behind the SSH emergency script: clears
 * the secret and both lockouts, logs `totp-reset` without personal data.
 */
const makePayload = (attemptsRow: unknown) => ({
  update: vi.fn().mockResolvedValue({}),
  create: vi.fn().mockResolvedValue({}),
  logger: { warn: vi.fn() },
  db: {
    findOne: vi.fn().mockResolvedValue(attemptsRow),
    updateOne: vi.fn().mockResolvedValue({}),
  },
});

describe("resetTotp", () => {
  it("clears the secret and the password lockout", async () => {
    const payload = makePayload(null);
    await resetTotp(payload as never, 7, { via: "ssh" });
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "users",
        id: 7,
        overrideAccess: true,
        data: { totpSecret: null, loginAttempts: 0, lockUntil: null },
      }),
    );
  });

  it("clears the code lockout when the member has one", async () => {
    const payload = makePayload({ id: "7", attempts: 5, lockUntil: "2099-01-01T00:00:00Z" });
    await resetTotp(payload as never, 7, { via: "ssh" });
    expect(payload.db.updateOne).toHaveBeenCalledWith({
      collection: "totp-attempts",
      id: "7",
      data: { attempts: 0, lockUntil: null },
    });
  });

  it("logs totp-reset: system actor, user id only, the path taken", async () => {
    const payload = makePayload(null);
    await resetTotp(payload as never, 7, { via: "ssh" });
    expect(payload.db.updateOne).not.toHaveBeenCalled();
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "activity-log",
        data: expect.objectContaining({ type: "totp-reset", actor: null, targetType: "user", targetId: "7", meta: { via: "ssh" } }),
      }),
    );
  });
});
