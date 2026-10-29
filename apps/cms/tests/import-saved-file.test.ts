import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { readSavedFile } from "../src/lib/import/saved-file";

/**
 * 013-saved-page-import (T005, research S3/S4) — a page saved from the
 * editor's browser: single HTML file (SingleFile, "HTML only") or MHTML
 * (Chrome/Edge "Page web, un seul fichier").
 */
const saved = (name: string) =>
  readFileSync(resolve(process.cwd(), "../web/tests/e2e/fixtures/import-source/saved", name));
// Every host resolves to a public address, except "cms" (internal).
const dns = async (host: string) => (host === "cms" ? ["172.19.0.3"] : ["93.184.216.34"]);
const read = (bytes: Buffer | string, name: string) => readSavedFile(Buffer.from(bytes), name, dns);

const mhtml = (parts: string[], extraHeaders = "") =>
  [
    "From: <Saved by Blink>",
    ...(extraHeaders ? [extraHeaders] : []),
    "MIME-Version: 1.0",
    'Content-Type: multipart/related;\r\n\ttype="text/html";\r\n\tboundary="----B"',
    "",
    "",
    ...parts.flatMap((p) => ["------B", p]),
    "------B--",
    "",
  ].join("\r\n");

describe("single HTML file", () => {
  it("accepts a SingleFile save and reads its original address", async () => {
    const file = await read(saved("fixture.singlefile.html"), "Potager Facile.html");
    expect(file).not.toBe("unsupported");
    if (file === "unsupported") return;
    expect(file.kind).toBe("html");
    expect(file.originalUrl).toBe("http://import-fixture/index.html");
    expect(file.html).toContain("Un potager généreux");
    expect(file.resources.size).toBe(0);
  });

  it("reads Chrome's « saved from url » mark, after a BOM and comments", async () => {
    const file = await read(
      "﻿<!-- saved from url=(0027)https://exemple.fr/offre-1 -->\n<!-- autre -->\n<!DOCTYPE html><html><body><h1>Offre</h1></body></html>",
      "offre.htm",
    );
    expect(file).toMatchObject({ kind: "html", originalUrl: "https://exemple.fr/offre-1" });
  });

  it("drops a declared address that is internal, not http(s) or has credentials", async () => {
    for (const mark of ["http://cms:3000/admin", "file:///etc/passwd", "https://user:pw@exemple.fr/"]) {
      const file = await read(`<!-- saved from url=(0000)${mark} --><html><body><p>x</p></body></html>`, "p.html");
      expect(file).toMatchObject({ originalUrl: null });
    }
  });

  it("an HTML file with no declared address has originalUrl null", async () => {
    expect(await read("<!doctype html><html><body><p>x</p></body></html>", "p.html")).toMatchObject({ originalUrl: null });
  });
});

describe("MHTML", () => {
  it("parses Chrome's save of the fixture page: HTML, image parts, original address", async () => {
    const file = await read(saved("fixture.mhtml"), "fixture.mhtml");
    expect(file).not.toBe("unsupported");
    if (file === "unsupported") return;
    expect(file.kind).toBe("mhtml");
    expect(file.originalUrl).toBe("http://import-fixture/index.html");
    expect(file.html).toContain("Un potager généreux, sans y passer vos week-ends");
    expect(file.html).not.toContain("=3D");
    expect(file.resources.get("http://import-fixture/img/fond.jpg")?.contentType).toBe("image/jpeg");
    expect(file.resources.get("http://import-fixture/img/fond.jpg")!.data.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(file.resources.get("http://import-fixture/img/tomates.svg")?.data.toString("utf8")).toContain("<svg");
    // The stylesheet Chrome refers to by cid: is served from the file under a same-origin address.
    expect(file.html).not.toMatch(/cid:/);
    const css = [...file.resources.entries()].find(([k]) => k.startsWith("http://import-fixture/__trefle-saved/cid/"));
    expect(css?.[1].contentType).toBe("text/css");
    expect(file.html).toContain(css![0]);
  });

  it("decodes quoted-printable (soft breaks, =XX, UTF-8), base64 and binary parts", async () => {
    const file = await read(
      mhtml(
        [
          "Content-Type: text/html\r\nContent-Transfer-Encoding: quoted-printable\r\nContent-Location: https://exemple.fr/\r\n\r\n<html><body><h1 class=3D\"t\">G=C3=A9n=C3=A9reux =\r\npotager</h1><img src=3D\"https://cdn.exemple.fr/a.png\"></body></html>\r\n",
          `Content-Type: image/png\r\nContent-Transfer-Encoding: base64\r\nContent-Location: https://cdn.exemple.fr/a.png\r\n\r\n${Buffer.from("PNGDATA").toString("base64")}\r\n`,
          "Content-Type: text/plain\r\nContent-Transfer-Encoding: binary\r\nContent-Location: https://exemple.fr/robots.txt\r\n\r\nUser-agent: *\r\n",
        ],
        "Snapshot-Content-Location: https://exemple.fr/",
      ),
      "p.mht",
    );
    if (file === "unsupported") throw new Error("unsupported");
    expect(file.html).toContain('<h1 class="t">Généreux potager</h1>');
    expect(file.resources.get("https://cdn.exemple.fr/a.png")?.data.toString()).toBe("PNGDATA");
    expect(file.resources.get("https://exemple.fr/robots.txt")?.data.toString()).toBe("User-agent: *");
    expect(file.originalUrl).toBe("https://exemple.fr/");
  });

  it("falls back to the HTML part's location when there is no snapshot header; frames by cid only are not the page", async () => {
    const file = await read(
      mhtml([
        "Content-Type: text/html\r\nContent-Location: https://exemple.fr/landing\r\n\r\n<html><body><p>Page</p></body></html>\r\n",
        "Content-Type: text/html\r\nContent-ID: <frame-1@mhtml.blink>\r\nContent-Location: cid:frame-1@mhtml.blink\r\n\r\n<html><body>frame</body></html>\r\n",
      ]),
      "p.mhtml",
    );
    expect(file).toMatchObject({ kind: "mhtml", originalUrl: "https://exemple.fr/landing" });
    if (file !== "unsupported") expect(file.html).toContain("<p>Page</p>");
  });
});

describe("refused files", () => {
  it.each([
    ["a PDF", "%PDF-1.7\n1 0 obj", "offre.pdf"],
    ["a PDF renamed .html", "%PDF-1.7\n1 0 obj", "offre.html"],
    ["a ZIP renamed .mhtml", "PK\u0003\u0004rest", "offre.mhtml"],
    ["an empty file", "", "offre.html"],
    ["an MHTML without an HTML part", mhtml(["Content-Type: image/png\r\nContent-Location: https://x.fr/a.png\r\n\r\nx\r\n"]), "p.mhtml"],
    ["plain text", "Bonjour, ceci n'est pas une page.", "note.html"],
  ])("%s", async (_, bytes, name) => {
    expect(await read(bytes, name)).toBe("unsupported");
  });
});
