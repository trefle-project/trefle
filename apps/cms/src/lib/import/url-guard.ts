import { lookup as dnsLookupCb, type LookupAddress, type LookupOptions } from "node:dns";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { Agent, fetch as undiciFetch } from "undici";

import { isProductionDeployment } from "../env";
import { ImportError } from "./errors";

/**
 * The page import's guard against internal addresses (012-url-page-import,
 * research R4, FR-002). An editor-supplied URL must never make the CMS or
 * the browser container reach the compose network (`cms`, `db`, `garage`…),
 * the host, or a cloud metadata endpoint. Used before anything is fetched
 * (`assertPublicHttpUrl`) and for every request the browser makes while
 * rendering (`isAllowedHost`, via `context.route` in render.ts), and for the
 * CMS's own downloads of imported images (`guardedFetch` / `guardedAgent`).
 *
 * `IMPORT_ALLOW_PRIVATE_HOSTS` (test-only, refused at boot in production by
 * lib/env.ts) names host names exempted from the address check, e.g. the e2e
 * fixture site `import-fixture`. Everything else private stays blocked.
 */

// [network, prefix length] — every IPv4 range that is not the public internet.
const BLOCKED_V4: [string, number][] = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // RFC 1918
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, incl. cloud metadata 169.254.169.254
  ["172.16.0.0", 12], // RFC 1918 (Docker's default bridge networks)
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay anycast
  ["192.168.0.0", 16], // RFC 1918
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved, incl. broadcast
];

const v4ToInt = (ip: string): number =>
  ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;

function isPublicV4(ip: string): boolean {
  const n = v4ToInt(ip);
  return !BLOCKED_V4.some(([net, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (v4ToInt(net) & mask);
  });
}

/** 8 × 16-bit groups of an IPv6 address (dotted IPv4 tail accepted), or null. */
function v6Groups(ip: string): number[] | null {
  let addr = ip.toLowerCase().split("%")[0] ?? "";
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (tail?.[1]) {
    if (isIP(tail[1]) !== 4) return null;
    const n = v4ToInt(tail[1]);
    addr = `${addr.slice(0, -tail[1].length)}${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest].map((g) =>
    parseInt(g, 16),
  );
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

function isPublicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  const [a = 0, b = 0] = g;
  const embeddedV4 = `${g[6]! >> 8}.${g[6]! & 0xff}.${g[7]! >> 8}.${g[7]! & 0xff}`;
  const firstSix = g.slice(0, 6);
  // ::ffff:a.b.c.d (mapped) and ::a.b.c.d (compatible): judge the IPv4 inside.
  if (firstSix.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return false; // :: and ::1
    return isPublicV4(embeddedV4);
  }
  // 64:ff9b::/96 NAT64 — also judged by the embedded IPv4.
  if (a === 0x64 && b === 0xff9b && firstSix.slice(2).every((x) => x === 0)) return isPublicV4(embeddedV4);
  if ((a & 0xfe00) === 0xfc00) return false; // fc00::/7 unique local
  if ((a & 0xffc0) === 0xfe80) return false; // fe80::/10 link-local
  if ((a & 0xffc0) === 0xfec0) return false; // fec0::/10 site-local (deprecated)
  if ((a & 0xff00) === 0xff00) return false; // ff00::/8 multicast
  if (a === 0x2001 && b === 0x0db8) return false; // documentation
  if (a === 0x2002) return isPublicV4(`${b >> 8}.${b & 0xff}.${g[2]! >> 8}.${g[2]! & 0xff}`); // 6to4
  return true;
}

/** True only for an address on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  if (family === 4) return isPublicV4(ip);
  if (family === 6) return isPublicV6(ip);
  return false;
}

/** Host names exempted from the address check (test-only, see header). */
export function allowedPrivateHosts(): Set<string> {
  if (isProductionDeployment()) return new Set();
  return new Set(
    (process.env.IMPORT_ALLOW_PRIVATE_HOSTS ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

const bareHost = (hostname: string) => hostname.replace(/^\[|\]$/g, "").toLowerCase();

type Lookup = (host: string) => Promise<string[]>;

const dnsLookup: Lookup = async (host) => (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Resolves `hostname` and says whether every address is public (or the host
 * is explicitly exempted). Throws `unresolvable` when DNS has no answer.
 */
export async function isAllowedHost(hostname: string, resolve: Lookup = dnsLookup): Promise<boolean> {
  const host = bareHost(hostname);
  if (allowedPrivateHosts().has(host)) return true;
  if (isIP(host)) return isPublicAddress(host);
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new ImportError("unresolvable", host);
  }
  if (addresses.length === 0) throw new ImportError("unresolvable", host);
  // One private address is enough to refuse: the browser may pick any of them.
  return addresses.every(isPublicAddress);
}

/**
 * Validates an editor-supplied URL before anything is fetched: http(s) only,
 * no credentials, default ports only, and a host whose every address is
 * public. Returns the parsed URL; throws `ImportError` (`invalid-url`,
 * `private-address`, `unresolvable`).
 */
export async function assertPublicHttpUrl(raw: string, resolve: Lookup = dnsLookup): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("invalid-url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("invalid-url");
  if (url.username || url.password) throw new ImportError("invalid-url");
  // `URL` drops the scheme's default port, so "" covers :80 on http / :443 on https.
  if (url.port !== "" && url.port !== "80" && url.port !== "443") throw new ImportError("invalid-url");
  if (!url.hostname) throw new ImportError("invalid-url");
  if (!(await isAllowedHost(url.hostname, resolve))) throw new ImportError("private-address", url.hostname);
  return url;
}

// ---------------------------------------------------------------- server-side fetches

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * An undici `Agent` whose DNS lookup refuses private addresses, so a host
 * that resolves differently between the check and the connection (DNS
 * rebinding) is still refused at connect time. Hosts in
 * `IMPORT_ALLOW_PRIVATE_HOSTS` pass (test-only). IP literals never reach a
 * lookup: `guardedFetch` checks those itself, on every redirect hop.
 */
export function guardedAgent(): Agent {
  const guardedLookup = (hostname: string, options: LookupOptions, callback: LookupCallback) => {
    dnsLookupCb(hostname, { ...options, all: true, verbatim: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const list = addresses as LookupAddress[];
      const allowed = allowedPrivateHosts().has(bareHost(hostname)) || (list.length > 0 && list.every((a) => isPublicAddress(a.address)));
      if (!allowed) {
        const e: NodeJS.ErrnoException = new Error(`${hostname} resolves to a private address`);
        e.code = "EPRIVATEADDRESS";
        return callback(e, []);
      }
      if (options.all) return callback(null, list);
      const first = list[0]!;
      callback(null, first.address, first.family);
    });
  };
  return new Agent({ connect: { lookup: guardedLookup as never } });
}

/**
 * How the import introduces itself, in its browser and in its own image
 * downloads: the real client identity plus this product token, so a site
 * owner can recognise the importer and allow it (with the server's fixed IP).
 */
export const IMPORT_UA_TOKEN = "TrefleImport/1.0";

const MAX_REDIRECTS = 5;

/** True for the error `guardedAgent` raises when a connection would reach a private address. */
const isPrivateConnect = (e: unknown): boolean => {
  for (let cur: unknown = e; cur && typeof cur === "object"; cur = (cur as { cause?: unknown }).cause) {
    if ((cur as { code?: unknown }).code === "EPRIVATEADDRESS") return true;
  }
  return false;
};

export type GuardedRequestInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: Buffer;
  signal?: AbortSignal;
  agent?: Agent;
  resolve?: Lookup;
};

/**
 * One request from the server itself, redirects NOT followed (a 3xx comes
 * back as is): http(s) only, no credentials, the host checked (IP literals
 * included), and the connection made through `guardedAgent`, so the address
 * actually connected to is the one checked. Throws
 * `ImportError("private-address")` when either check refuses.
 */
export async function guardedRequest(raw: string | URL, init: GuardedRequestInit = {}): Promise<Response> {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ImportError("invalid-url", url.protocol);
  if (url.username || url.password) throw new ImportError("invalid-url");
  if (!(await isAllowedHost(url.hostname, init.resolve))) throw new ImportError("private-address", url.hostname);
  try {
    return (await undiciFetch(url, {
      method: init.method,
      headers: init.headers,
      body: init.body,
      dispatcher: init.agent ?? guardedAgent(),
      redirect: "manual",
      signal: init.signal,
    })) as unknown as Response;
  } catch (e) {
    if (isPrivateConnect(e)) throw new ImportError("private-address", url.hostname);
    throw e;
  }
}

/**
 * GET `raw` from the server itself (imported images), redirects followed by
 * hand so each hop goes through `guardedRequest`.
 */
export async function guardedFetch(
  raw: string,
  init: { signal?: AbortSignal; agent?: Agent; resolve?: Lookup; headers?: Record<string, string> } = {},
): Promise<Response> {
  const agent = init.agent ?? guardedAgent();
  let url = new URL(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await guardedRequest(url, { ...init, agent });
    const location = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
    if (!location) return res;
    await res.body?.cancel();
    url = new URL(location, url);
  }
  throw new ImportError("unreachable", "too many redirects");
}
