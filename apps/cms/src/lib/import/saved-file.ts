import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertPublicHttpUrl } from "./url-guard";

/**
 * A page saved from the editor's own browser (013-saved-page-import,
 * research S3/S4): a single HTML file (SingleFile, "HTML only") or a
 * single-file web archive (MHTML, Chrome/Edge « Page web, un seul fichier »).
 *
 * The file is untrusted. This module only splits and decodes it: the HTML is
 * displayed later with JavaScript off, and every request it makes goes
 * through the address guard — except those answered from `resources`.
 *
 * - MHTML parts are decoded (base64, quoted-printable, binary) and keyed by
 *   their `Content-Location`. Chrome refers to some parts by `cid:` (its
 *   stylesheet), which the browser never routes: those references are
 *   rewritten to `<page origin>/__trefle-saved/cid/<id>`, served from the file.
 * - The page's original address is read from the markers browsers and
 *   single-file tools write, and kept only if it is a public http(s) address.
 */

export type SavedResource = { contentType: string; data: Buffer; headers?: Record<string, string> };

export type SavedFile = {
  kind: "html" | "mhtml";
  html: string;
  /** Absolute URL → content, answered from the file (never the network). */
  resources: Map<string, SavedResource>;
  /** The page's own public address, when the file declares one. */
  originalUrl: string | null;
};

export const SAVED_FILE_EXTENSIONS = [".html", ".htm", ".mhtml", ".mht"] as const;
export const MAX_SAVED_FILE_BYTES = 25 * 1024 * 1024;
/** Where an uploaded saved page waits for its import (deleted when the import ends). */
export const SAVED_FILES_DIR = join(tmpdir(), "trefle-page-imports");
export const savedFilePath = (importId: number | string) => join(SAVED_FILES_DIR, String(importId));

/** Where a page without a (public) original address is displayed. */
export const SAVED_PAGE_FALLBACK_ORIGIN = "https://saved-page.invalid";

type Lookup = (host: string) => Promise<string[]>;

const extensionOf = (name: string) => {
  const m = /\.[a-z0-9]+$/i.exec(name.trim());
  return m ? m[0].toLowerCase() : "";
};

/** An HTML document: after an optional BOM, whitespace and comments, a doctype or <html>. */
function looksLikeHtml(text: string): boolean {
  let s = text.replace(/^\uFEFF/, "");
  for (;;) {
    s = s.replace(/^\s+/, "");
    if (!s.startsWith("<!--")) break;
    const end = s.indexOf("-->");
    if (end < 0) return false;
    s = s.slice(end + 3);
  }
  return /^<(!doctype\s+html|html[\s>])/i.test(s);
}

async function publicOrNull(url: string | null | undefined, resolve?: Lookup): Promise<string | null> {
  if (!url) return null;
  try {
    return (await assertPublicHttpUrl(url, resolve)).href;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- MIME

type Headers = Record<string, string>;

/** Header block (folded lines unfolded) → lower-cased names. */
function parseHeaders(block: string): Headers {
  const out: Headers = {};
  for (const line of block.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) out[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
  }
  return out;
}

const param = (value: string | undefined, name: string) =>
  value ? new RegExp(`${name}\\s*=\\s*"?([^";]+)"?`, "i").exec(value)?.[1] : undefined;

function decodeQuotedPrintable(body: string): Buffer {
  const soft = body.replace(/=\r?\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < soft.length; i++) {
    const c = soft[i]!;
    if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(soft.slice(i + 1, i + 3))) {
      bytes.push(parseInt(soft.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of Buffer.from(c, "utf8")) bytes.push(b);
    }
  }
  return Buffer.from(bytes);
}

function decodePart(encoding: string | undefined, body: string): Buffer {
  switch ((encoding ?? "").toLowerCase()) {
    case "base64":
      return Buffer.from(body.replace(/\s+/g, ""), "base64");
    case "quoted-printable":
      return decodeQuotedPrintable(body);
    default:
      return Buffer.from(body.replace(/\r?\n$/, ""), "latin1");
  }
}

type Part = { headers: Headers; data: Buffer };

function splitMultipart(text: string): { headers: Headers; parts: Part[] } | null {
  const headerEnd = text.search(/\r?\n\r?\n/);
  if (headerEnd < 0) return null;
  const headers = parseHeaders(text.slice(0, headerEnd));
  const type = headers["content-type"] ?? "";
  const boundary = param(type, "boundary");
  if (!/^multipart\//i.test(type) || !boundary) return null;
  const parts: Part[] = [];
  const chunks = text.split(`--${boundary}`);
  for (const chunk of chunks.slice(1)) {
    if (chunk.startsWith("--")) break; // closing delimiter
    const body = chunk.replace(/^\r?\n/, "");
    const end = body.search(/\r?\n\r?\n/);
    if (end < 0) continue;
    const partHeaders = parseHeaders(body.slice(0, end));
    const content = body.slice(end).replace(/^\r?\n\r?\n/, "").replace(/\r?\n$/, "");
    parts.push({ headers: partHeaders, data: decodePart(partHeaders["content-transfer-encoding"], content) });
  }
  return { headers, parts };
}

const mimeOf = (h: Headers) => (h["content-type"] ?? "application/octet-stream").split(";")[0]!.trim().toLowerCase();
const cidOf = (h: Headers) => {
  const loc = h["content-location"];
  if (loc?.startsWith("cid:")) return loc.slice(4);
  const id = h["content-id"];
  return id ? id.replace(/^<|>$/g, "") : undefined;
};

async function readMhtml(text: string, resolve?: Lookup): Promise<SavedFile | "unsupported"> {
  // The multipart is read as latin1 so every byte survives; text parts are UTF-8.
  const split = splitMultipart(text);
  if (!split) return "unsupported";
  const main = split.parts.find((p) => mimeOf(p.headers) === "text/html" && !p.headers["content-location"]?.startsWith("cid:"));
  if (!main) return "unsupported";
  const originalUrl = await publicOrNull(split.headers["snapshot-content-location"] ?? main.headers["content-location"], resolve);
  const origin = originalUrl ? new URL(originalUrl).origin : SAVED_PAGE_FALLBACK_ORIGIN;
  const cidUrl = (id: string) => `${origin}/__trefle-saved/cid/${encodeURIComponent(id)}`;
  const rewriteCids = (s: string) => s.replace(/cid:([^"')\s>]+)/g, (_, id: string) => cidUrl(id));

  const resources = new Map<string, SavedResource>();
  for (const p of split.parts) {
    if (p === main) continue;
    const contentType = mimeOf(p.headers);
    const data = contentType === "text/css" ? Buffer.from(rewriteCids(p.data.toString("utf8")), "utf8") : p.data;
    const cid = cidOf(p.headers);
    const loc = p.headers["content-location"];
    if (cid) resources.set(cidUrl(cid), { contentType, data });
    if (loc && /^https?:\/\//i.test(loc)) {
      try {
        resources.set(new URL(loc).href, { contentType, data });
      } catch {
        /* unusable location: the part is only reachable by cid, if at all */
      }
    }
  }
  return { kind: "mhtml", html: rewriteCids(main.data.toString("utf8")), resources, originalUrl };
}

function declaredHtmlAddress(html: string): string | null {
  const head = html.slice(0, 4096);
  return (
    /Page saved with SingleFile[\s\S]*?url:\s*(\S+)/.exec(head)?.[1] ??
    /<!--\s*saved from url=\(\d+\)(\S+?)\s*-->/i.exec(head)?.[1] ??
    null
  );
}

/** The saved page, or "unsupported" for anything else (wrong type, empty, not a page). */
export async function readSavedFile(bytes: Buffer, fileName: string, resolve?: Lookup): Promise<SavedFile | "unsupported"> {
  const ext = extensionOf(fileName);
  if (!(SAVED_FILE_EXTENSIONS as readonly string[]).includes(ext) || bytes.length === 0) return "unsupported";
  if (ext === ".mhtml" || ext === ".mht") return readMhtml(bytes.toString("latin1"), resolve);
  const html = bytes.toString("utf8");
  if (!looksLikeHtml(html)) return "unsupported";
  return { kind: "html", html, resources: new Map(), originalUrl: await publicOrNull(declaredHtmlAddress(html), resolve) };
}
