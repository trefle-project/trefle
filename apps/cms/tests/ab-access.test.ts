import { describe, expect, it } from "vitest";

import { AbConversions } from "../src/collections/AbConversions";
import { AbExposures } from "../src/collections/AbExposures";

/**
 * 018-ab-significance, FR-009 — no admin screen or API shows a per-visitor
 * row: both collections are hidden and refuse every operation to everyone,
 * Administrators and the service account included (code uses overrideAccess).
 */
const callers = {
  admin: { role: "admin", isActive: true, _strategy: "totp" },
  editor: { role: "editor", isActive: true, _strategy: "totp" },
  service: { isService: true },
  anonymous: null,
};

describe.each([AbExposures, AbConversions])("$slug", (collection) => {
  it("is hidden in the admin", () => {
    expect(collection.admin?.hidden).toBe(true);
  });

  it.each(Object.entries(callers))("refuses every operation to %s", async (_name, user) => {
    for (const op of ["read", "create", "update", "delete"] as const) {
      const access = collection.access?.[op] as ((args: unknown) => unknown) | undefined;
      expect(access, op).toBeTypeOf("function");
      expect(await access!({ req: { user } }), op).toBe(false);
    }
  });
});
