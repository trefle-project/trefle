import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 003-post-launch-improvements (FR-007/SC-007) — the admin body-size limit
 * is enforced by Payload's own busboy multipart parser before any request
 * handler in this codebase runs, so it isn't exercisable by calling a
 * function directly (unlike the rest of this suite). This asserts the two
 * configs stay a single, deliberate, matching value instead — a save that
 * actually exceeds it is covered by quickstart.md §6's manual check.
 */
const cmsRoot = join(__dirname, "..");

describe("admin body-size limit (FR-007)", () => {
  it("payload.config.ts sets fieldSize to 500 KB", () => {
    const src = readFileSync(join(cmsRoot, "src/payload.config.ts"), "utf8");
    expect(src).toMatch(/bodyParser:\s*\{\s*limits:\s*\{\s*fieldSize:\s*500\s*\*\s*1024\s*\}\s*\}/);
  });

  it("next.config.mjs sets bodySizeLimit to the matching \"500kb\"", () => {
    const src = readFileSync(join(cmsRoot, "next.config.mjs"), "utf8");
    expect(src).toMatch(/serverActions:\s*\{\s*bodySizeLimit:\s*"500kb"\s*\}/);
  });
});
