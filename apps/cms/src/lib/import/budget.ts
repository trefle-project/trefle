import type { Payload, Where } from "payload";

import { adminLanguageOf } from "../../i18n";
import { intlLocale } from "../admin-locale";
import { conversionConfigured } from "./convert";

/**
 * Page import spending (012-url-page-import, research R10, FR-027): a
 * workspace-wide monthly cap and a per-user monthly budget, both in euros,
 * over calendar months in Europe/Paris. Only the start endpoint checks them
 * (FR-027c): an import that has started always finishes and records its
 * full cost, even past a limit.
 */

const TZ = "Europe/Paris";

type ImportSettings = {
  importMonthlyCapEur?: number | null;
  importDefaultUserBudgetEur?: number | null;
};
type ImportUser = { id: number | string; importMonthlyBudgetEur?: number | null };

export type BudgetStatus = {
  workspace: { capEur: number; spentEur: number; remainingEur: number };
  user: { budgetEur: number; spentEur: number; remainingEur: number; isDefault: boolean };
  enabled: boolean;
  available: boolean;
  blockedBy: "workspace" | "user" | null;
  /** First day of next month, 00:00 Paris, with its offset: "2026-10-01T00:00:00+02:00". */
  resetsAt: string;
};

const DEFAULT_CAP_EUR = 20;
const DEFAULT_USER_BUDGET_EUR = 10;

/** Paris wall-clock parts of an instant, and Paris's UTC offset (minutes) at it. */
function parisParts(at: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: TZ,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  const asUtc = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  return { year: +parts.year!, month: +parts.month!, offsetMin: Math.round((asUtc - at.getTime()) / 60_000) };
}

/** The instant of 00:00 Paris on the 1st of `month` (1–12, may overflow into the next year). */
function parisMonthStart(year: number, month: number): Date {
  const naive = Date.UTC(year, month - 1, 1);
  // Midnight is never inside a DST jump in Paris (they happen at 02:00/03:00),
  // so one correction with the offset at the guessed instant is exact.
  let at = new Date(naive - parisParts(new Date(naive)).offsetMin * 60_000);
  at = new Date(naive - parisParts(at).offsetMin * 60_000);
  return at;
}

/** Current calendar month in Europe/Paris: [start, end). */
export function monthBounds(now: Date = new Date()): { start: Date; end: Date } {
  const { year, month } = parisParts(now);
  return { start: parisMonthStart(year, month), end: parisMonthStart(year, month + 1) };
}

/** `2026-10-01T00:00:00+02:00` — the reset instant written in Paris time. */
export function formatParisMidnight(at: Date): string {
  const { year, month, offsetMin } = parisParts(at);
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(month)}-01T00:00:00${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function sumCostEur(payload: Payload, now: Date, userId?: number | string): Promise<number> {
  const { start, end } = monthBounds(now);
  const where: Where = {
    and: [
      { startedAt: { greater_than_equal: start.toISOString() } },
      { startedAt: { less_than: end.toISOString() } },
      ...(userId != null ? [{ createdBy: { equals: userId } }] : []),
    ],
  };
  const res = await payload.find({
    collection: "page-imports",
    where,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { costEur: true },
  });
  return res.docs.reduce((sum, d) => sum + (typeof d.costEur === "number" ? d.costEur : 0), 0);
}

/** Workspace total for the current Paris month. */
export const spentEur = (payload: Payload, now: Date = new Date()) => sumCostEur(payload, now);

/** One user's total for the current Paris month. */
export const userSpentEur = (payload: Payload, userId: number | string, now: Date = new Date()) =>
  sumCostEur(payload, now, userId);

/** A user's own budget, or the Settings default when they have none. */
export function userBudgetEur(user: ImportUser, settings: ImportSettings): { budgetEur: number; isDefault: boolean } {
  const own = user.importMonthlyBudgetEur;
  if (typeof own === "number" && own >= 0) return { budgetEur: own, isDefault: false };
  return { budgetEur: settings.importDefaultUserBudgetEur ?? DEFAULT_USER_BUDGET_EUR, isDefault: true };
}

/**
 * The feature flag (Principle III): a conversion is configured (API key, or
 * the test-only fixture mode) and the workspace cap is above 0.
 */
export function featureEnabled(settings: ImportSettings): boolean {
  return conversionConfigured() && (settings.importMonthlyCapEur ?? DEFAULT_CAP_EUR) > 0;
}

export async function budgetStatus(payload: Payload, user: ImportUser, now: Date = new Date()): Promise<BudgetStatus> {
  const settings = (await payload.findGlobal({ slug: "settings", depth: 0, overrideAccess: true })) as ImportSettings;
  const capEur = settings.importMonthlyCapEur ?? DEFAULT_CAP_EUR;
  const [workspaceSpent, userSpent] = await Promise.all([spentEur(payload, now), userSpentEur(payload, user.id, now)]);
  const { budgetEur, isDefault } = userBudgetEur(user, settings);

  // User first, so the message is personal when both limits are reached.
  const userBlocked = budgetEur <= 0 || userSpent >= budgetEur;
  const workspaceBlocked = capEur <= 0 || workspaceSpent >= capEur;
  const blockedBy = userBlocked ? "user" : workspaceBlocked ? "workspace" : null;

  const { end } = monthBounds(now);
  return {
    workspace: { capEur, spentEur: round2(workspaceSpent), remainingEur: round2(Math.max(0, capEur - workspaceSpent)) },
    user: {
      budgetEur,
      spentEur: round2(userSpent),
      remainingEur: round2(Math.max(0, budgetEur - userSpent)),
      isDefault,
    },
    enabled: featureEnabled(settings),
    available: blockedBy === null,
    blockedBy,
    resetsAt: formatParisMidnight(end),
  };
}

const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

/** "1er octobre" for a reset instant. */
export function resetDayFr(now: Date = new Date()): string {
  const { end } = monthBounds(now);
  return `1er ${MONTHS_FR[parisParts(end).month - 1]}`;
}

/** The reset day in the member's language: « 1er octobre », "1 October". */
export function resetDay(lang: unknown, now: Date = new Date()): string {
  if (adminLanguageOf(lang) === "fr") return resetDayFr(now);
  const { end } = monthBounds(now);
  return end.toLocaleDateString(intlLocale("en"), { day: "numeric", month: "long", timeZone: "Europe/Paris" });
}
