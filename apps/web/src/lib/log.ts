/**
 * Structured logger (T017) — one JSON object per line, no personal data.
 * FR-038: email, IP, field values, request bodies MUST never be logged.
 */

type Level = "debug" | "info" | "warn" | "error";

/**
 * FR-038 defence in depth (T089). A field is redacted when its name matches
 * exactly (short, ambiguous names) or *contains* one of the needles (longer,
 * unambiguous). Matching ignores `_`/`-` so `field_values`, `fieldValues`,
 * `user-agent` all hit. Never widen a value through here — redact by key only.
 */
const PII_KEYS_EXACT = new Set(["ip", "name", "hp_check"]);
const PII_KEY_NEEDLES = [
  "email",
  "passwo",
  "passwd",
  "secret",
  "apikey",
  "api_key",
  "token",
  "authorization",
  "cookie",
  "ipaddress",
  "useragent",
  "user_agent",
  "firstname",
  "lastname",
  "surname",
  "fullname",
  "phone",
  "fieldvalue",
  "formvalue",
  "referer",
  "referrer",
  "consenttext",
  "consentpurpose",
  "metadata",
  "requestbody",
  "postal",
  "street",
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  if (PII_KEYS_EXACT.has(k)) return true;
  if (k === "body") return true;
  const compact = k.replace(/[_-]/g, "");
  return PII_KEY_NEEDLES.some((n) => compact.includes(n.replace(/[_-]/g, "")));
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[deep]";
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: Level, msg: string, fields: Record<string, unknown> = {}): void {
  const line = JSON.stringify({
    t: new Date().toISOString(),
    level,
    app: "web",
    msg,
    ...(redact(fields) as Record<string, unknown>),
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, f?: Record<string, unknown>) => emit("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
};

/** FR-012: one structured line per submission attempt, outcome + reason only. */
export type LeadSubmissionOutcome = "accepted" | "rejected";
export type LeadSubmissionReason =
  | "ok"
  | "unknown_host"
  | "honeypot"
  | "timing"
  | "rate_limited"
  | "unpublished"
  | "validation"
  | "consent_required"
  | "upstream_unavailable";

export function leadSubmissionLog(args: {
  outcome: LeadSubmissionOutcome;
  reason: LeadSubmissionReason;
  pageId?: string;
}): void {
  emit("info", "lead_submission", args);
}
