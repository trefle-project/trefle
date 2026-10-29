import { describe, expect, it, vi } from "vitest";

import { resetTotpEndpoint } from "../src/endpoints/resetTotp";

/**
 * 019-admin-access (T038, FR-009) — POST /api/users/:id/reset-totp.
 */
type Handler = (req: unknown) => Promise<Response>;
const handler = resetTotpEndpoint.handler as unknown as Handler;

const totpOn = { config: { custom: { totp: { pluginOptions: { disabled: false } } } } };
const admin = { id: 1, role: "admin", isActive: true, _strategy: "totp" };

const makeReq = (user: unknown, id: string, member: unknown = { id: Number(id), email: "m@x.fr" }, language = "fr") => {
  const payload = {
    ...totpOn,
    findByID: vi.fn().mockResolvedValue(member),
    update: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    logger: { warn: vi.fn() },
    db: { findOne: vi.fn().mockResolvedValue({ id, attempts: 5, lockUntil: "2099-01-01T00:00:00Z" }), updateOne: vi.fn() },
  };
  return { req: { user, payload, routeParams: { id }, i18n: { language } }, payload };
};

describe("POST /api/users/:id/reset-totp", () => {
  it("Editor → 403, nothing changed", async () => {
    const { req, payload } = makeReq({ id: 2, role: "editor", isActive: true, _strategy: "totp" }, "7");
    expect((await handler(req)).status).toBe(403);
    expect(payload.update).not.toHaveBeenCalled();
  });

  it("Administrator who has not entered the code yet → 403", async () => {
    const { req } = makeReq({ ...admin, _strategy: "local-jwt" }, "7");
    expect((await handler(req)).status).toBe(403);
  });

  it("own account → 400 with the message in the member's language", async () => {
    const { req, payload } = makeReq(admin, "1");
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Utilisez votre page de compte." });
    expect(payload.update).not.toHaveBeenCalled();
    expect(await (await handler(makeReq(admin, "1", undefined, "en").req)).json()).toEqual({ error: "Use your account page." });
  });

  it("unknown member or the service account → 404", async () => {
    expect((await handler(makeReq(admin, "99", null).req)).status).toBe(404);
    expect((await handler(makeReq(admin, "3", { id: 3, isService: true }).req)).status).toBe(404);
  });

  it("Administrator → 204: secret and lockouts cleared, totp-reset logged with the caller as actor", async () => {
    const { req, payload } = makeReq(admin, "7");
    expect((await handler(req)).status).toBe(204);
    expect(payload.update).toHaveBeenCalledWith(
      expect.objectContaining({ collection: "users", id: 7, data: { totpSecret: null, loginAttempts: 0, lockUntil: null } }),
    );
    expect(payload.db.updateOne).toHaveBeenCalledWith({ collection: "totp-attempts", id: "7", data: { attempts: 0, lockUntil: null } });
    expect(payload.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "activity-log",
        data: expect.objectContaining({ type: "totp-reset", actor: 1, targetId: "7", meta: { via: "admin" } }),
      }),
    );
  });
});
