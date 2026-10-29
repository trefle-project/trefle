/**
 * Dev seed (T050). Idempotent-ish: skips rows that already exist.
 * Run: `npm run --workspace @trefle/cms seed:dev`  (env from apps/cms/.env.local)
 *
 * Creates: an admin, the read-only `service` API-key account, `settings`
 * defaults, and the domains site-a.localhost / site-b.localhost.
 */
import { getPayload } from "payload";

import config from "../payload.config";

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@trefle.localhost";
const SERVICE_EMAIL = "service@trefle.localhost";

/**
 * Admin password. Outside production — or in the local/CI containerised stack,
 * which runs the prod image but sets `SEED_ALLOW_DEFAULT_PASSWORD=1` in the dev
 * overlay — the well-known dev value is fine. A real deployment
 * (`-f docker-compose.prod.yml`, no overlay) MUST pass `SEED_ADMIN_PASSWORD`
 * (>= 16 chars); the seed refuses otherwise (002-security-hardening).
 */
const ADMIN_PASSWORD = ((): string => {
  const strict =
    process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_DEFAULT_PASSWORD !== "1";
  if (!strict) return process.env.SEED_ADMIN_PASSWORD ?? "trefle-dev-123";
  const pw = process.env.SEED_ADMIN_PASSWORD ?? "";
  if (pw.length < 16) {
    throw new Error(
      "seed: production requires SEED_ADMIN_PASSWORD (>= 16 chars) — refusing to seed a default admin password.",
    );
  }
  return pw;
})();

/**
 * Deterministic renderer key: if `CMS_SERVICE_API_KEY` looks like a real key
 * (hex, ≥24 chars) the seed sets the service user's apiKey to *exactly* that,
 * so `infra/.env` / `apps/web/.env.local` and the DB agree with no copy-paste.
 * Otherwise a random key is generated and printed.
 */
const envKey = process.env.CMS_SERVICE_API_KEY ?? "";
const SERVICE_API_KEY = /^[a-f0-9]{24,}$/i.test(envKey)
  ? envKey
  : crypto.randomUUID().replace(/-/g, "");

async function main(): Promise<void> {
  const payload = await getPayload({ config });

  const admins = await payload.find({
    collection: "users",
    where: { role: { equals: "admin" } },
    limit: 1,
    overrideAccess: true,
  });
  if (admins.totalDocs === 0) {
    await payload.create({
      collection: "users",
      overrideAccess: true,
      context: { skipInvite: true },
      data: {
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
        role: "admin",
        name: "Admin",
        isActive: true,
        invitationStatus: "active",
      },
    });
    payload.logger.info(
      ADMIN_PASSWORD === "trefle-dev-123"
        ? `seed: created admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD} — change on first login`
        : `seed: created admin ${ADMIN_EMAIL} — change this password on first login`,
    );
  }

  const service = await payload.find({
    collection: "users",
    where: { email: { equals: SERVICE_EMAIL } },
    limit: 1,
    overrideAccess: true,
  });
  if (service.totalDocs === 0) {
    await payload.create({
      collection: "users",
      overrideAccess: true,
      context: { skipInvite: true },
      data: {
        email: SERVICE_EMAIL,
        password: crypto.randomUUID(),
        role: "editor",
        name: "Renderer service",
        isActive: true,
        isService: true,
        invitationStatus: "active",
        enableAPIKey: true,
        apiKey: SERVICE_API_KEY,
      },
    });
    payload.logger.info(`seed: service account apiKey = ${SERVICE_API_KEY}`);
    if (!/^[a-f0-9]{24,}$/i.test(envKey)) {
      payload.logger.info("seed: put that value in CMS_SERVICE_API_KEY (infra/.env + apps/web/.env.local)");
    }
  } else if (/^[a-f0-9]{24,}$/i.test(envKey)) {
    // Reconcile drift — make the existing service user's key match the env.
    await payload.update({
      collection: "users",
      id: service.docs[0]!.id,
      overrideAccess: true,
      context: { skipInvite: true },
      data: { enableAPIKey: true, apiKey: SERVICE_API_KEY },
    });
    payload.logger.info("seed: service account apiKey re-synced to CMS_SERVICE_API_KEY");
  }

  // 007-gtm-tagging, FR-014 — the banner's French row must always exist;
  // seed it here (idempotent — only added if `cookieBannerTranslations` is
  // still empty) once `languages` has its `fr` seed row.
  const frenchLanguage = await payload.find({
    collection: "languages",
    where: { code: { equals: "fr" } },
    limit: 1,
    overrideAccess: true,
  });
  const existingSettings = await payload.findGlobal({ slug: "settings", overrideAccess: true });
  const cookieBannerTranslations =
    Array.isArray(existingSettings.cookieBannerTranslations) && existingSettings.cookieBannerTranslations.length > 0
      ? undefined
      : frenchLanguage.docs[0]
        ? [
            {
              language: frenchLanguage.docs[0].id,
              title: "Votre vie privée",
              body: "Nous utilisons des cookies pour mesurer l'audience et améliorer votre expérience. Vous pouvez accepter ou refuser à tout moment.",
              acceptLabel: "Accepter",
              rejectLabel: "Refuser",
              revisitLabel: "Préférences cookies",
            },
          ]
        : undefined;

  await payload.updateGlobal({
    slug: "settings",
    overrideAccess: true,
    data: {
      retentionMonths: 24,
      // 023-admin-i18n — the dev stack and the e2e suite run a French admin
      // (a fresh database would start in English).
      adminLanguage: "fr",
      defaultConsentPurposeText:
        "J'accepte d'être recontacté(e) au sujet de cette offre. Voir la politique de confidentialité.",
      defaultPrivacyNoticeUrl: "/privacy",
      defaultPrivacyNoticeVersion: "2026-01",
      exportConsentedOnlyByDefault: true,
      senderEmail: "trefle@localhost",
      notifyOnNewLead: false,
      ...(cookieBannerTranslations ? { cookieBannerTranslations } : {}),
    },
  });

  for (const hostname of ["site-a.localhost", "site-b.localhost"]) {
    const exists = await payload.find({
      collection: "domains",
      where: { hostname: { equals: hostname } },
      limit: 1,
      overrideAccess: true,
    });
    if (exists.totalDocs === 0) {
      await payload.create({
        collection: "domains",
        overrideAccess: true,
        data: { hostname, isActive: true, label: hostname },
      });
      payload.logger.info(`seed: created domain ${hostname}`);
    }
  }

  payload.logger.info("seed: done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
