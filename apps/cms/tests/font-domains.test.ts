import type { Payload } from "payload";
import { describe, expect, it, vi } from "vitest";

import { Fonts } from "../src/collections/Fonts";
import { domainsLabel, domainsUsingFont } from "../src/components/FontDomains";

/** Fonts list « Domaines » column: the domains whose fonts use the file. */
describe("domainsUsingFont", () => {
  it("asks for the domains whose font rows hold the file, all of them, hostnames only", async () => {
    const find = vi.fn().mockResolvedValue({ docs: [{ id: 1, hostname: "a.example" }, { id: 2, hostname: "b.example" }] });
    const hostnames = await domainsUsingFont({ find } as unknown as Payload, 16);
    expect(hostnames).toEqual(["a.example", "b.example"]);
    expect(find).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: "domains",
        where: { "fonts.files": { in: [16] } },
        select: { hostname: true },
        pagination: false,
      }),
    );
  });
});

describe("domainsLabel", () => {
  it("names every domain, or says none uses the file", () => {
    expect(domainsLabel(["a.example", "b.example"])).toBe("a.example, b.example");
    expect(domainsLabel([])).toBe("Aucun");
    expect(domainsLabel([], "en")).toBe("None");
  });
});

describe("Fonts collection", () => {
  it("shows the « Domaines » column by default", () => {
    expect(Fonts.admin?.defaultColumns).toContain("domains");
    const field = Fonts.fields.find((f) => "name" in f && f.name === "domains");
    expect(field).toMatchObject({ type: "ui", label: { fr: "Domaines", en: "Domains" }, admin: { components: { Cell: "@/components/FontDomains#FontDomainsCell" } } });
  });
});
