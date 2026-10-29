import { afterEach, describe, expect, it, vi } from "vitest";

import { ImportError } from "../src/lib/import/errors";
import { assertPublicHttpUrl, isAllowedHost, isPublicAddress } from "../src/lib/import/url-guard";

/**
 * 012-url-page-import (T022, research R4) — the page import never reaches a
 * non-public address: private ranges, loopback, link-local/metadata, docker
 * service names, IPv4-mapped IPv6, or a host with one private address.
 */
const resolver = (table: Record<string, string[]>) => async (host: string) => {
  const hit = table[host];
  if (!hit) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
  return hit;
};

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "ok";
  } catch (e) {
    return e instanceof ImportError ? e.code : `unexpected: ${String(e)}`;
  }
};

afterEach(() => vi.unstubAllEnvs());

describe("isPublicAddress", () => {
  it.each([
    "0.1.2.3",
    "10.0.0.1",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.8",
    "192.0.2.1",
    "192.168.1.1",
    "198.18.0.1",
    "198.51.100.1",
    "203.0.113.1",
    "224.0.0.1",
    "239.255.255.250",
    "240.0.0.1",
    "255.255.255.255",
  ])("blocks IPv4 %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each([
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
    "::ffff:10.0.0.1",
    "::ffff:7f00:1",
    "::127.0.0.1",
    "64:ff9b::a9fe:a9fe",
    "2002:c0a8:0101::1",
  ])("blocks IPv6 %s", (ip) => expect(isPublicAddress(ip)).toBe(false));

  it.each(["93.184.216.34", "8.8.8.8", "172.32.0.1", "100.128.0.1", "2606:4700::6810:84e5", "::ffff:8.8.8.8"])(
    "accepts public %s",
    (ip) => expect(isPublicAddress(ip)).toBe(true),
  );

  it("rejects things that are not addresses", () => {
    expect(isPublicAddress("cms")).toBe(false);
    expect(isPublicAddress("")).toBe(false);
  });
});

describe("assertPublicHttpUrl", () => {
  const dns = resolver({
    "exemple.fr": ["93.184.216.34"],
    cms: ["172.18.0.5"],
    db: ["172.18.0.2"],
    "mixed.example": ["93.184.216.34", "10.0.0.7"],
    "v6only.example": ["2606:4700::6810:84e5"],
    "import-fixture": ["172.19.0.4"],
  });

  it("accepts a public http(s) URL", async () => {
    expect(await codeOf(assertPublicHttpUrl("https://exemple.fr/offre", dns))).toBe("ok");
    expect(await codeOf(assertPublicHttpUrl("http://exemple.fr:80/", dns))).toBe("ok");
    expect(await codeOf(assertPublicHttpUrl("https://exemple.fr:443/", dns))).toBe("ok");
    expect(await codeOf(assertPublicHttpUrl("https://v6only.example/", dns))).toBe("ok");
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "ftp://exemple.fr/", "data:text/html,x", "pas une url", ""])(
    "refuses %s as invalid-url",
    async (u) => expect(await codeOf(assertPublicHttpUrl(u, dns))).toBe("invalid-url"),
  );

  it("refuses credentials and non-standard ports", async () => {
    expect(await codeOf(assertPublicHttpUrl("https://user:pw@exemple.fr/", dns))).toBe("invalid-url");
    expect(await codeOf(assertPublicHttpUrl("https://exemple.fr:8080/", dns))).toBe("invalid-url");
    expect(await codeOf(assertPublicHttpUrl("http://cms:3000/", dns))).toBe("invalid-url");
  });

  it("refuses docker service names (they resolve to private addresses)", async () => {
    expect(await codeOf(assertPublicHttpUrl("http://cms/", dns))).toBe("private-address");
    expect(await codeOf(assertPublicHttpUrl("http://db/", dns))).toBe("private-address");
  });

  it("refuses literal private and metadata addresses, in every spelling", async () => {
    for (const u of [
      "http://169.254.169.254/latest/meta-data/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://[::1]/",
      "http://[::ffff:169.254.169.254]/",
      "http://localhost/",
    ]) {
      const local = resolver({ localhost: ["127.0.0.1", "::1"] });
      expect(await codeOf(assertPublicHttpUrl(u, local)), u).toBe("private-address");
    }
  });

  it("refuses a host with one public and one private address", async () => {
    expect(await codeOf(assertPublicHttpUrl("https://mixed.example/", dns))).toBe("private-address");
  });

  it("reports an unknown host as unresolvable", async () => {
    expect(await codeOf(assertPublicHttpUrl("https://nexiste-pas.example/", dns))).toBe("unresolvable");
  });

  it("exempts only the host names listed in IMPORT_ALLOW_PRIVATE_HOSTS, outside production", async () => {
    vi.stubEnv("IMPORT_ALLOW_PRIVATE_HOSTS", "import-fixture");
    vi.stubEnv("DEPLOY_ENV", "");
    expect(await codeOf(assertPublicHttpUrl("http://import-fixture/index.html", dns))).toBe("ok");
    expect(await codeOf(assertPublicHttpUrl("http://cms/", dns))).toBe("private-address");
    expect(await isAllowedHost("169.254.169.254", dns)).toBe(false);

    vi.stubEnv("DEPLOY_ENV", "production");
    expect(await codeOf(assertPublicHttpUrl("http://import-fixture/index.html", dns))).toBe("private-address");
  });
});
