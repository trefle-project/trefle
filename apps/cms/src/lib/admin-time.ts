/**
 * 022-ux-improvement (US6, research R12) — the admin's display time zone.
 * Each member may choose one (`users.displayTimezone`); otherwise the
 * installation default (`settings.adminTimezone`). Stored dates stay UTC;
 * everything here only reads or cuts them in a zone, with `Intl` (no
 * dependency). Pure: safe in server and client components.
 */
export const DEFAULT_ZONE = "Europe/Paris";

type Zoned = { displayTimezone?: string | null } | null | undefined;
type Defaults = { adminTimezone?: string | null } | null | undefined;

export function isValidZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The member's choice, else the installation default, else Europe/Paris. */
export function effectiveZone(user: Zoned, settings: Defaults): string {
  for (const tz of [user?.displayTimezone, settings?.adminTimezone]) if (isValidZone(tz)) return tz;
  return DEFAULT_ZONE;
}

/** Every IANA zone the runtime knows, for the select fields. */
export function zoneOptions(): string[] {
  const values = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  return values.includes("UTC") ? values : ["UTC", ...values];
}

type Parts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const formatters = new Map<string, Intl.DateTimeFormat>();
function partsIn(date: Date, tz: string): Parts {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatters.set(tz, f);
  }
  const out: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") out[p.type] = Number(p.value);
  return out as Parts;
}

/** Offset of `tz` from UTC at that instant, in minutes (Paris summer: 120). */
export function offsetMinutes(date: Date, tz: string): number {
  const p = partsIn(date, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60_000);
}

const pad = (n: number, size = 2) => String(Math.abs(n)).padStart(size, "0");

/** « +02:00 », « -04:00 », « +00:00 ». */
export function zoneOffset(date: Date, tz: string): string {
  const m = offsetMinutes(date, tz);
  return `${m < 0 ? "-" : "+"}${pad(Math.floor(Math.abs(m) / 60))}:${pad(Math.abs(m) % 60)}`;
}

/** The calendar day of that instant in `tz`, « YYYY-MM-DD ». */
export function zoneDay(date: Date, tz: string): string {
  const p = partsIn(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** « dd/MM/yyyy HH:mm » (the admin's `dateFormat`) or « dd/MM/yyyy », in `tz`. */
export function formatAdminDate(value: Date | string | number, tz: string, style: "datetime" | "date" = "datetime"): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = partsIn(date, tz);
  const day = `${pad(p.day)}/${pad(p.month)}/${p.year}`;
  return style === "date" ? day : `${day} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** ISO 8601 in `tz` with its offset, e.g. « 2026-10-23T14:05:00+02:00 » (exports). */
export function isoInZone(value: Date | string | number, tz: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const p = partsIn(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${zoneOffset(date, tz)}`;
}

/** The UTC instant of 00:00 on `day` (« YYYY-MM-DD ») in `tz` — DST-safe. */
function zoneMidnight(day: string, tz: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(y, m - 1, d);
  // Two passes: the offset at the guess, then at the corrected instant.
  let t = wall - offsetMinutes(new Date(wall), tz) * 60_000;
  t = wall - offsetMinutes(new Date(t), tz) * 60_000;
  return new Date(t);
}

const nextDay = (day: string): string => {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
};

/** Days `from`…`to` (inclusive, « YYYY-MM-DD ») in `tz` → [gte, lt) as ISO instants. */
export function zoneDayBounds(from: string, to: string, tz: string): { gte: string; lt: string } {
  return { gte: zoneMidnight(from, tz).toISOString(), lt: zoneMidnight(nextDay(to), tz).toISOString() };
}
