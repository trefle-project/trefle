// V6 (SC-003): many visitors behind Cloudflare must each get their own
// per-address limit — proves the origin sees CF-Connecting-IP, not the edge
// address. Run it from many source addresses at once (k6 cloud with several
// load zones, or N small hosts each with INSTANCES=1), one submission per
// instance, all within a minute; every one must be accepted.
//   docker run --rm -v "$PWD:/s" -w /s -e BASE_URL -e PAGE_PATH grafana/k6 run leads-distinct.js
import http from "k6/http";
import { check, sleep } from "k6";

import { BASE_URL, PAGE_PATH, formFields } from "./lib.js";

export const options = {
  scenarios: { once: { executor: "per-vu-iterations", vus: 1, iterations: 1 } },
  thresholds: { checks: ["rate==1"] },
};

export default function () {
  const page = http.get(`${BASE_URL}${PAGE_PATH}`);
  const { pageId, formToken } = formFields(page.body);
  sleep(2.5);
  const res = http.post(
    `${BASE_URL}/api/leads`,
    { pageId, formToken, email: `loadtest-distinct+${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`, consent: "on", hp_check: "" },
    { redirects: 0, headers: { Referer: `${BASE_URL}${PAGE_PATH}` } },
  );
  check(res, { "accepted, not rate-limited": (r) => r.status === 200 || r.status === 303 });
}
