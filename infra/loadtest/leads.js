// A light, steady stream of lead submissions on the test page, from this one
// machine. Its address must be in the temporary load-test skip rule
// (LOADTEST_IP=… infra/cloudflare/apply.sh) and the app's own per-address
// limit (10/min) still applies, so keep RATE low: this checks that
// submissions keep succeeding under page load, not intake throughput.
// Delete the test leads afterwards (admin → Leads, filter on the test page).
//   docker run --rm -v "$PWD:/s" -w /s -e BASE_URL -e PAGE_PATH grafana/k6 run leads.js
import http from "k6/http";
import { check, sleep } from "k6";

import { BASE_URL, PAGE_PATH, formFields } from "./lib.js";

export const options = {
  scenarios: { leads: { executor: "constant-vus", vus: 1, duration: __ENV.DURATION || "1m" } },
  thresholds: { checks: ["rate>0.99"] },
};

export default function () {
  const page = http.get(`${BASE_URL}${PAGE_PATH}`);
  const { pageId, formToken } = formFields(page.body);
  sleep(2.5); // the form token is valid from 2 s after the page render
  const res = http.post(
    `${BASE_URL}/api/leads`,
    { pageId, formToken, email: `loadtest+${__VU}-${__ITER}-${Date.now()}@example.com`, consent: "on", hp_check: "" },
    { redirects: 0, headers: { Referer: `${BASE_URL}${PAGE_PATH}` }, tags: { name: "lead" } },
  );
  check(res, { "accepted": (r) => r.status === 200 || r.status === 303 });
  sleep(4); // stays under the app's 10/min per address
}
