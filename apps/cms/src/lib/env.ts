/**
 * Environment helpers (002-security-hardening).
 *
 * `payload.config.ts` already has a `required()` that always throws. Some vars
 * (the S3 credentials) have safe dev fallbacks but MUST NOT fall back in
 * production — a real deployment with an unset S3 secret should refuse to boot,
 * not silently use `"trefle-secret"`.
 */
export const isProd = (): boolean => process.env.NODE_ENV === "production";

/**
 * `next build` runs with NODE_ENV=production but no runtime env (no DB, no S3),
 * and it evaluates `payload.config.ts` while collecting page data. Only enforce
 * at real runtime, never during the build phase.
 */
const isBuildPhase = (): boolean => process.env.NEXT_PHASE === "phase-production-build";

/**
 * At production runtime: return `process.env[name]` or throw if unset/empty.
 * During `next build` or outside production: return `process.env[name]`
 * (possibly `undefined`) so the caller's `?? "<dev fallback>"` still applies.
 */
export const requiredInProd = (name: string): string | undefined => {
  const v = process.env[name];
  if (isProd() && !isBuildPhase() && (v == null || v === "")) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
};

/**
 * 012-url-page-import — the real production deployment, as opposed to the
 * production *images* CI and the local stack also run (NODE_ENV=production
 * there too). Set only by infra/docker-compose.prod.yml.
 */
export const isProductionDeployment = (): boolean => process.env.DEPLOY_ENV === "production";

/**
 * Refuse to boot a production deployment with the page import's test-only
 * switches on: `IMPORT_AI_MODE=fixture` (canned conversion) and
 * `IMPORT_ALLOW_PRIVATE_HOSTS` (lets imports load private-network hosts).
 * Throws like `requiredInProd`, and likewise never during `next build`.
 */
export const assertImportEnvSafe = (): void => {
  if (!isProductionDeployment() || isBuildPhase()) return;
  if (process.env.IMPORT_AI_MODE === "fixture") {
    throw new Error("IMPORT_AI_MODE=fixture is test-only and refused when DEPLOY_ENV=production");
  }
  if ((process.env.IMPORT_ALLOW_PRIVATE_HOSTS ?? "").trim() !== "") {
    throw new Error("IMPORT_ALLOW_PRIVATE_HOSTS is test-only and refused when DEPLOY_ENV=production");
  }
};

/**
 * 019-admin-access — the admin's second factor may be switched off in a
 * production deployment only on purpose, as the rollback of its release
 * (`ALLOW_TOTP_DISABLED=1` alongside, runbook). Same rule as preflight.sh.
 */
export const assertTotpEnvSafe = (): void => {
  if (!isProductionDeployment() || isBuildPhase()) return;
  if (process.env.TOTP_DISABLED === "1" && process.env.ALLOW_TOTP_DISABLED !== "1") {
    throw new Error("TOTP_DISABLED=1 is refused when DEPLOY_ENV=production unless ALLOW_TOTP_DISABLED=1 (rollback only)");
  }
};
