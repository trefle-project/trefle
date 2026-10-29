import grapesjs from "grapesjs";
import { describe, expect, it } from "vitest";

import { DEVICE_BREAKPOINTS, DEVICE_PREVIEW_WIDTHS, clampColumns, columnsJson } from "../src/layout";

describe("DEVICE_BREAKPOINTS / DEVICE_PREVIEW_WIDTHS", () => {
  // The import writes per-device styles under these media conditions; they
  // must be exactly where the editor's own device views put them (R15).
  it("match the installed GrapesJS default device views", () => {
    const editor = grapesjs.init({ headless: true, storageManager: false });
    const devices = Object.fromEntries(
      editor.Devices.getDevices().map((d) => [d.id, { width: d.get("width"), media: d.getWidthMedia() }]),
    );
    expect(Object.keys(devices).sort()).toEqual(["desktop", "mobileLandscape", "mobilePortrait", "tablet"]);
    expect(`(max-width: ${devices.tablet?.media})`).toBe(DEVICE_BREAKPOINTS.tablet);
    expect(`(max-width: ${devices.mobileLandscape?.media})`).toBe(DEVICE_BREAKPOINTS.mobileLandscape);
    expect(`(max-width: ${devices.mobilePortrait?.media})`).toBe(DEVICE_BREAKPOINTS.mobilePortrait);
    expect(devices.tablet?.width).toBe(`${DEVICE_PREVIEW_WIDTHS.tablet}px`);
    expect(devices.mobileLandscape?.width).toBe(`${DEVICE_PREVIEW_WIDTHS.mobileLandscape}px`);
    expect(devices.mobilePortrait?.width).toBe(`${DEVICE_PREVIEW_WIDTHS.mobilePortrait}px`);
    editor.destroy();
  });
});

describe("columnsJson", () => {
  it("clamps to 2–4 columns and keeps data-cols in step", () => {
    expect(clampColumns(1)).toBe(2);
    expect(clampColumns(7)).toBe(4);
    const c = columnsJson([[], [], []]);
    expect(c.attributes?.["data-cols"]).toBe("3");
    expect(c.components).toHaveLength(3);
  });
});
