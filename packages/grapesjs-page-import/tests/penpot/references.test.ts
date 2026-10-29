import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { convertBoard, MAX_PAGE_BYTES } from "../../src/penpot/convert";
import { readPenpotFile } from "../../src/penpot/read";
import { reportText } from "../../src/serialize";

/**
 * 015-penpot-site-import T017 — the four reference sites (kept outside the
 * repo, ../penpot/references). Opt-in:
 *   PENPOT_REFERENCES_DIR=../../../penpot/references npx vitest run tests/penpot/references.test.ts
 * Prints each board's size; fails if one exceeds the editor's cap or has no single h1.
 */
const dir = process.env.PENPOT_REFERENCES_DIR;
const files = dir && existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith(".penpot")) : [];

describe.skipIf(!files.length)("reference files", () => {
  it.each(files)("%s", (name) => {
    const f = readPenpotFile(new Uint8Array(readFileSync(join(dir!, name))));
    const site = f.pages.find((p) => p.name === "Site")!;
    const paths = Object.fromEntries(site.boards.map((b) => [b.id, b.proposedPath]));
    for (const b of site.boards) {
      const out = convertBoard(f, site.id, b.id, {
        paths,
        images: {},
        fonts: new Set(),
        fileName: name,
      });
      console.log(`${name} ${b.name}: ${(out.bytes / 1024).toFixed(0)} KB`);
      expect(out.bytes).toBeLessThan(MAX_PAGE_BYTES);
      expect(out.html.match(/<h1[ >]/g)?.length ?? 0).toBe(1);
      // The two drawn carousels (pagination dots under a row of review cards) are reported.
      const carousel = out.report.simplified.some((s) => reportText(s.what).startsWith("Carrousel"));
      const drawn = (name === "trefle-ref-1-agence.penpot" && b.name === "À propos") || (name === "trefle-ref-2-blog.penpot" && b.name === "Auteur");
      expect(carousel, `${name} ${b.name}`).toBe(drawn);
    }
  });
});
