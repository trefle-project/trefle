// 007-gtm-tagging — ambient types for the tiny `gtag` shim + `dataLayer`
// Tagging's inline scripts define on `window` (research.md §4).
export {};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}
