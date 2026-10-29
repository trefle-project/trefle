import { log } from "./log";

/**
 * Aggregate, non-personal counters (FR-012, FR-035, FR-014a). In-memory —
 * every bump is also emitted as a structured log line so the count survives a
 * restart in aggregate form. A durable admin view is Phase 8 (T055a).
 */
type Counter =
  | "abuse_rejected_honeypot"
  | "abuse_rejected_timing"
  | "abuse_rejected_rate_limit"
  | "transient_upstream_failure";

const counts: Record<Counter, number> = {
  abuse_rejected_honeypot: 0,
  abuse_rejected_timing: 0,
  abuse_rejected_rate_limit: 0,
  transient_upstream_failure: 0,
};

export function bump(name: Counter): void {
  counts[name] += 1;
  // `counter` not `name` — the log redactor scrubs a field literally called `name`.
  log.info("counter", { counter: name, value: counts[name] });
}

export function snapshot(): Readonly<Record<Counter, number>> {
  return { ...counts };
}
