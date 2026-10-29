import type { CollectionAfterChangeHook, CollectionAfterLoginHook } from "payload";

/**
 * T080 (US5-1, FR-034a) — when an Administrator adds a member, email them a
 * "set your password" link (Payload's reset-password flow over SMTP / Mailpit
 * in dev). Never throws into the create: a mail failure must not block the
 * invite, it is only logged (no address in the log — FR-038).
 *
 * `context.skipInvite` opts a create out (used by the dev seed and by the
 * first-login activation update below).
 */
export const usersSendInvite: CollectionAfterChangeHook = async ({ doc, operation, req, context }) => {
  if (operation !== "create") return doc;
  if ((context as { skipInvite?: boolean } | undefined)?.skipInvite || doc?.isService) return doc;

  try {
    await req.payload.forgotPassword({
      collection: "users",
      data: { email: doc.email },
      disableEmail: false,
      req,
    });
    req.payload.logger.info(`invite: set-password email sent for user ${doc.id}`);
  } catch (err) {
    req.payload.logger.warn(`invite: set-password email failed for user ${doc.id}: ${String(err)}`);
  }
  return doc;
};

/**
 * Flip an invited member to `active` the first time they sign in.
 *
 * `req` MUST be threaded into the nested update: since Payload 3.88 the
 * `afterLogin` hook runs inside the login's DB transaction, so a separate
 * transaction here would wait forever on the row lock the login still holds.
 */
export const usersActivateOnLogin: CollectionAfterLoginHook = async ({ user, req }) => {
  if ((user as { invitationStatus?: string })?.invitationStatus !== "invited") return user;
  try {
    await req.payload.update({
      collection: "users",
      id: user.id,
      data: { invitationStatus: "active" },
      overrideAccess: true,
      context: { skipInvite: true },
      req,
    });
  } catch (err) {
    req.payload.logger.warn(`invite: could not activate user ${user.id}: ${String(err)}`);
  }
  return user;
};
