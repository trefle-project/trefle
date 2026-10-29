import type { DeviceCheck } from "@trefle/grapesjs-page-import/serialize";
import { describe, expect, it } from "vitest";

import { summariseDeviceChecks } from "../src/lib/import/device-summary";

/** 015 T048 — one report line per kind of screen problem, not one per element and screen. */
describe("summariseDeviceChecks", () => {
  it("groups by kind, names the screens and the first five elements", () => {
    const menu = ["Home", "About", "Guides", "Contact", "Log in", "Subscribe", "Terms"];
    const checks: DeviceCheck[] = [
      ...(["desktop", "mobilePortrait"] as const).flatMap((device) =>
        menu.map((m) => ({ device, kind: "small-target" as const, where: `lien « ${m} »`, detail: "40×17px" })),
      ),
      { device: "mobilePortrait", kind: "overflow", where: "image « hero »", detail: "412px > 360px" },
    ];
    expect(summariseDeviceChecks(checks)).toEqual([
      "Bouton ou lien trop petit pour le doigt (ordinateur, mobile portrait) — 7 éléments : lien « Home » ; lien « About » ; lien « Guides » ; lien « Contact » ; lien « Log in » et 2 autres",
      "Élément qui dépasse de l'écran (mobile portrait) — 1 élément : image « hero » (412px > 360px)",
    ]);
  });
  it("nothing to say → no line", () => {
    expect(summariseDeviceChecks([])).toEqual([]);
  });
});
