import type { Endpoint } from "payload";

import { isAdmin } from "../access";
import { adminText } from "../i18n";
import { resetTotp } from "../lib/totp-reset";

/**
 * POST /api/users/:id/reset-totp — 019-admin-access (FR-009, research R6,
 * contracts/cms-endpoints.md). An Administrator (second factor passed) clears
 * another member's second factor and lockouts; that member sets their
 * authenticator app up again at their next login. Not for one's own account
 * (the account page has the plugin's own controls).
 */
export const resetTotpEndpoint: Endpoint = {
  path: "/:id/reset-totp",
  method: "post",
  handler: async (req) => {
    if (!isAdmin({ req } as never) || !req.user) return new Response(null, { status: 403 });
    const id = Number(req.routeParams?.id);
    if (!Number.isInteger(id)) return Response.json({ error: adminText(req.i18n?.language)("members.notFound") }, { status: 404 });
    if (id === Number(req.user.id)) {
      return Response.json({ error: adminText(req.i18n?.language)("members.useOwnAccount") }, { status: 400 });
    }
    const member = await req.payload
      .findByID({ collection: "users", id, depth: 0, overrideAccess: true })
      .catch(() => null);
    if (!member || (member as { isService?: boolean }).isService) {
      return Response.json({ error: adminText(req.i18n?.language)("members.notFound") }, { status: 404 });
    }
    await resetTotp(req.payload, id, { actor: req.user.id, via: "admin", req });
    return new Response(null, { status: 204 });
  },
};
