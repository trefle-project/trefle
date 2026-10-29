// Shared by the k6 scenarios (017-edge-protection, research R16).
export const BASE_URL = __ENV.BASE_URL || "https://example.com";
export const PAGE_PATH = __ENV.PAGE_PATH || "/loadtest";

// "Load for one minute at RATE per second" — a constant arrival rate, so the
// result says how many requests per second the target actually sustained.
export function rateScenario(defaultRate) {
  return {
    executor: "constant-arrival-rate",
    rate: Number(__ENV.RATE || defaultRate),
    timeUnit: "1s",
    duration: __ENV.DURATION || "1m",
    preAllocatedVUs: Number(__ENV.VUS || 50),
    maxVUs: Number(__ENV.MAX_VUS || 500),
  };
}

// The lead form's hidden fields, from the page HTML.
export function formFields(html) {
  const field = (name) => {
    const m = html.match(new RegExp(`name="${name}" value="([^"]*)"`));
    return m ? m[1] : null;
  };
  return { pageId: field("pageId"), formToken: field("formToken") };
}
