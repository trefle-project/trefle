import { afterEach, describe, expect, it, vi } from "vitest";

import { assertImportEnvSafe, assertTotpEnvSafe, requiredInProd } from "../src/lib/env";

/**
 * 002-security-hardening — `requiredInProd` must fail closed in production and
 * stay permissive (returns undefined, caller falls back) everywhere else.
 */
describe("requiredInProd", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws when unset in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("__T_ENV__", undefined);
    expect(() => requiredInProd("__T_ENV__")).toThrow(/Missing required env var: __T_ENV__/);
  });

  it("throws when empty in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("__T_ENV__", "");
    expect(() => requiredInProd("__T_ENV__")).toThrow(/__T_ENV__/);
  });

  it("returns the value when set in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("__T_ENV__", "real-value");
    expect(requiredInProd("__T_ENV__")).toBe("real-value");
  });

  it("returns undefined when unset outside production (caller falls back)", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("__T_ENV__", undefined);
    expect(requiredInProd("__T_ENV__")).toBeUndefined();
  });

  it("does not throw during `next build` (NEXT_PHASE=phase-production-build)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("__T_ENV__", undefined);
    expect(requiredInProd("__T_ENV__")).toBeUndefined();
  });
});

/**
 * 012-url-page-import (T006) — the import's test-only switches are refused on
 * the real production deployment (DEPLOY_ENV), not on NODE_ENV=production
 * alone: CI and the local stack run the production images too.
 */
describe("assertImportEnvSafe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses IMPORT_AI_MODE=fixture when DEPLOY_ENV=production", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "");
    expect(() => assertImportEnvSafe()).toThrow(/IMPORT_AI_MODE=fixture/);
  });

  it("refuses IMPORT_ALLOW_PRIVATE_HOSTS when DEPLOY_ENV=production", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("IMPORT_AI_MODE", "");
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "import-fixture");
    expect(() => assertImportEnvSafe()).toThrow(/IMPORT_ALLOW_PRIVATE_HOSTS/);
  });

  it("allows both on the production images outside the production deployment (CI, local stack)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEPLOY_ENV", "");
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "import-fixture");
    expect(() => assertImportEnvSafe()).not.toThrow();
  });

  it("accepts a production deployment without the switches", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("IMPORT_AI_MODE", "");
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "");
    expect(() => assertImportEnvSafe()).not.toThrow();
  });

  it("does not throw during `next build`", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    vi.stubEnv("IMPORT_AI_MODE", "fixture");
    expect(() => assertImportEnvSafe()).not.toThrow();
  });
});

/**
 * 019-admin-access — the admin's second factor stays on in a production
 * deployment, unless switched off on purpose as the rollback of its release.
 */
describe("assertTotpEnvSafe", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses TOTP_DISABLED=1 on the production deployment", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("TOTP_DISABLED", "1");
    vi.stubEnv("ALLOW_TOTP_DISABLED", "");
    expect(() => assertTotpEnvSafe()).toThrow(/TOTP_DISABLED/);
  });

  it("accepts it with ALLOW_TOTP_DISABLED=1 (rollback)", () => {
    vi.stubEnv("DEPLOY_ENV", "production");
    vi.stubEnv("TOTP_DISABLED", "1");
    vi.stubEnv("ALLOW_TOTP_DISABLED", "1");
    expect(() => assertTotpEnvSafe()).not.toThrow();
  });

  it("accepts it outside the production deployment (dev, CI, e2e)", () => {
    vi.stubEnv("DEPLOY_ENV", "");
    vi.stubEnv("TOTP_DISABLED", "1");
    expect(() => assertTotpEnvSafe()).not.toThrow();
  });
});
