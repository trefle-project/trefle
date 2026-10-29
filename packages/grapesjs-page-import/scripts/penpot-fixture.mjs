#!/usr/bin/env node
/**
 * Builds a small test `.penpot` from a reference export (015-penpot-site-import,
 * research P16): only the chosen boards of one Penpot page, with the images
 * and typographies they use. Entries are copied, never rewritten.
 *
 *   node scripts/penpot-fixture.mjs <source.penpot> <page name> <out.penpot> <board> [<board>…]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

const [src, pageName, out, ...boardNames] = process.argv.slice(2);
if (!src || !pageName || !out || !boardNames.length) {
  console.error("usage: penpot-fixture.mjs <source.penpot> <page name> <out.penpot> <board>…");
  process.exit(1);
}

const ROOT = "00000000-0000-0000-0000-000000000000";
const entries = unzipSync(readFileSync(src));
const json = (name) => JSON.parse(strFromU8(entries[name]));
const names = Object.keys(entries).filter((n) => !n.endsWith("/"));

const manifest = json("manifest.json");
const fileId = manifest.files[0].id;
const pagePath = names.find(
  (n) =>
    n.startsWith(`files/${fileId}/pages/`) &&
    n.split("/").length === 4 &&
    json(n).name === pageName,
);
if (!pagePath) throw new Error(`no page named ${pageName}`);
const pageId = pagePath.split("/")[3].replace(/\.json$/, "");

const shapeDir = `files/${fileId}/pages/${pageId}/`;
const shapes = new Map(
  names
    .filter((n) => n.startsWith(shapeDir))
    .map((n) => [n.slice(shapeDir.length).replace(/\.json$/, ""), n]),
);
const shape = (id) => json(shapes.get(id));

const keep = new Set(["manifest.json", `files/${fileId}.json`, pagePath]);
const mediaIds = new Set();
const boards = [];
const walk = (id) => {
  const s = shape(id);
  keep.add(shapes.get(id));
  for (const f of s.fills ?? []) if (f.fillImage?.id) mediaIds.add(f.fillImage.id);
  if (s.type === "text") {
    const visit = (n) => {
      for (const f of n.fills ?? []) if (f.fillImage?.id) mediaIds.add(f.fillImage.id);
      (n.children ?? []).forEach(visit);
    };
    visit(s.content ?? {});
  }
  for (const c of s.shapes ?? []) if (shapes.has(c)) walk(c);
};
for (const name of boardNames) {
  const b = [...shapes.keys()]
    .map(shape)
    .find((s) => s.parentId === ROOT && s.type === "frame" && s.name === name);
  if (!b) throw new Error(`no top-level board named ${name}`);
  boards.push(b.id);
  walk(b.id);
}

// The page root keeps only the chosen boards as children.
const root = shape(ROOT);
root.shapes = (root.shapes ?? []).filter((id) => boards.includes(id));
const outEntries = { [shapes.get(ROOT)]: strToU8(JSON.stringify(root)) };

for (const id of mediaIds) {
  const m = `files/${fileId}/media/${id}.json`;
  if (!entries[m]) continue;
  keep.add(m);
  const media = json(m);
  for (const sid of [media.mediaId, media.thumbnailId].filter(Boolean)) {
    for (const n of names) if (n.startsWith(`objects/${sid}.`)) keep.add(n);
  }
}
for (const n of names) if (n.startsWith(`files/${fileId}/typographies/`)) keep.add(n);

for (const n of keep) if (!outEntries[n]) outEntries[n] = entries[n];
const bytes = zipSync(outEntries, { level: 9 });
writeFileSync(out, bytes);
console.log(
  `${out}: ${boards.length} boards, ${Object.keys(outEntries).length} entries, ${mediaIds.size} media, ${bytes.length} bytes`,
);
