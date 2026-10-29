/**
 * 019-admin-access — emergency reset of a member's second factor, run on the
 * VPS when no Administrator can sign in (runbook, FR-010):
 *
 *   $COMPOSE exec cms npm --workspace @trefle/cms run totp:reset -- <email>
 *
 * The member sets their authenticator app up again at their next login.
 */
import { getPayload } from "payload";

import config from "../src/payload.config";
import { resetTotp } from "../src/lib/totp-reset";

async function main(): Promise<number> {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage : totp:reset -- <email>");
    return 1;
  }
  const payload = await getPayload({ config });
  const found = await payload.find({
    collection: "users",
    where: { email: { equals: email } },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const user = found.docs[0];
  if (!user || user.isService) {
    console.error(`Aucun membre avec l'adresse ${email}.`);
    return 1;
  }
  await resetTotp(payload, user.id, { via: "ssh" });
  console.log(`Double authentification réinitialisée pour ${email}.`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
