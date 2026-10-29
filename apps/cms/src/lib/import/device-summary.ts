import type { DeviceCheck } from "@trefle/grapesjs-page-import/serialize";

import { adminLanguageOf, adminText } from "../../i18n";

/**
 * The « Formats d'écran » section of an import report, one line per kind of
 * problem instead of one per element and screen (015 T048: a Penpot menu
 * gave 80 « trop petit pour le doigt » lines). Each line names the screens
 * concerned and the first few elements, by order of appearance.
 */
const DEVICE_ORDER: DeviceCheck["device"][] = ["desktop", "tablet", "mobileLandscape", "mobilePortrait"];
const EXAMPLES = 5;

export function summariseDeviceChecks(checks: DeviceCheck[], lang: unknown = "fr"): string[] {
  const t = adminText(lang);
  const known = (kind: string) => ["horizontal-scroll", "small-text", "small-target", "overflow"].includes(kind);
  const byKind = new Map<DeviceCheck["kind"], { devices: Set<DeviceCheck["device"]>; where: string[] }>();
  for (const c of checks) {
    const entry = byKind.get(c.kind) ?? { devices: new Set(), where: [] };
    entry.devices.add(c.device);
    const where = c.detail && c.kind !== "small-target" ? `${c.where} (${c.detail})` : c.where;
    if (!entry.where.includes(where)) entry.where.push(where);
    byKind.set(c.kind, entry);
  }
  return [...byKind].map(([kind, { devices, where }]) => {
    const screens = DEVICE_ORDER.filter((d) => devices.has(d))
      .map((d) => t(`imports.report.device.${d}`))
      .join(", ");
    const shown = where.slice(0, EXAMPLES).join(adminLanguageOf(lang) === "fr" ? " ; " : "; ");
    const rest = where.length - EXAMPLES;
    const more = rest > 0 ? t(rest > 1 ? "imports.report.deviceMoreMany" : "imports.report.deviceMoreOne", { n: rest }) : "";
    const check = known(kind) ? t(`imports.report.check.${kind}`) : kind;
    return t(where.length > 1 ? "imports.report.deviceLineMany" : "imports.report.deviceLineOne", { check, screens, n: where.length, shown, more });
  });
}
